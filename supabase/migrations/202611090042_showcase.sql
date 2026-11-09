alter table public.barberflow_products
  add column showcase boolean not null default false,
  add column description text not null default '' check (char_length(description)<=1500);
grant update(showcase,description),insert(showcase,description) on public.barberflow_products to authenticated;

-- Preserve the existing creation API for older clients.
create function public.barberflow_create_product(shop uuid, product_name text, product_sku text, sale_price integer,
  unit_cost integer, stock_floor integer, expiry date, initial_units integer, product_barcode text,
  product_description text, in_showcase boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare created uuid;
begin
  created:=public.barberflow_create_product(shop,product_name,product_sku,sale_price,unit_cost,stock_floor,
    expiry,initial_units,product_barcode);
  update public.barberflow_products set description=product_description,showcase=in_showcase where id=created;
  return created;
end;
$$;

create table public.barberflow_showcase_pix (
  establishment_id uuid primary key references public.barberflow_establishments(id) on delete cascade,
  pix_key text not null check (pix_key collate "C" ~ '^[!-~]{1,77}$'),
  merchant text not null check (merchant ~ '^[A-Z0-9 .-]{1,25}$'),
  city text not null check (city ~ '^[A-Z0-9 .-]{1,15}$')
);
alter table public.barberflow_showcase_pix enable row level security;
revoke all on public.barberflow_showcase_pix from public,anon,authenticated;
grant select,insert,update,delete on public.barberflow_showcase_pix to authenticated;
create policy showcase_pix_owner on public.barberflow_showcase_pix to authenticated
using (exists(select 1 from public.barberflow_establishments e
  where e.id=establishment_id and e.owner_id=(select auth.uid())))
with check (exists(select 1 from public.barberflow_establishments e
  where e.id=establishment_id and e.owner_id=(select auth.uid())));

create table public.barberflow_showcase_orders (
  id uuid primary key,
  establishment_id uuid not null references public.barberflow_establishments(id),
  product_id uuid not null references public.barberflow_products(id),
  buyer_id uuid references auth.users(id) on delete set null,
  buyer_name text not null,
  shop_name text not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 100),
  unit_price_cents integer not null,
  total_cents integer not null check (total_cents between 1 and 99999999),
  pix_key text not null,
  merchant text not null,
  city text not null,
  status text not null default 'pending' check (status in ('pending','paid','ready','collected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  bank_reference text,
  read_at timestamptz
);
alter table public.barberflow_showcase_orders enable row level security;
revoke all on public.barberflow_showcase_orders from public,anon,authenticated;
grant select on public.barberflow_showcase_orders to authenticated;
create policy showcase_order_participants on public.barberflow_showcase_orders for select to authenticated
using (buyer_id=(select auth.uid()) or exists(select 1 from public.barberflow_establishments e
  where e.id=establishment_id and e.owner_id=(select auth.uid())));
create index showcase_orders_buyer on public.barberflow_showcase_orders(buyer_id,created_at desc);
create index showcase_orders_shop on public.barberflow_showcase_orders(establishment_id,created_at desc);
create index showcase_orders_reservations on public.barberflow_showcase_orders(product_id,expires_at) where status='pending';
create unique index showcase_orders_reference on public.barberflow_showcase_orders(establishment_id,upper(bank_reference))
  where bank_reference is not null;

create function barberflow_private.showcase_held(item uuid) returns bigint
language sql security definer set search_path='' as $$
  select coalesce(sum(o.quantity),0) from public.barberflow_showcase_orders o
  where o.product_id=item and o.status='pending' and o.expires_at>statement_timestamp();
$$;

create function barberflow_private.keep_showcase_reservations() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.stock<old.stock or (old.deleted_at is null and new.deleted_at is not null)
    or (new.expires_on is distinct from old.expires_on and new.expires_on<(now() at time zone 'America/Sao_Paulo')::date))
    and barberflow_private.showcase_held(old.id)>(case
      when new.deleted_at is not null or new.expires_on<(now() at time zone 'America/Sao_Paulo')::date then 0 else new.stock end) then
    raise exception using errcode='22023',message='Stock is reserved for showcase orders';
  end if;
  return new;
end;
$$;
create trigger barberflow_keep_showcase_reservations before update of stock,deleted_at,expires_on on public.barberflow_products
for each row execute function barberflow_private.keep_showcase_reservations();

create function public.barberflow_showcase_products(profile_slug text, preview_shop uuid default null)
returns table(id uuid,shop_id uuid,name text,description text,price_cents integer,available integer,
  bundle_units integer,bundle_cents integer,pix_enabled boolean)
language sql stable security definer set search_path='' as $$
  select p.id,e.id,p.name,p.description,p.price_cents,(p.stock-held.units)::integer,
    case when p.promo_until>=today.day and p.promo_cents<p.price_cents::bigint*p.promo_units then p.promo_units end,
    case when p.promo_until>=today.day and p.promo_cents<p.price_cents::bigint*p.promo_units then p.promo_cents end,
    pix.establishment_id is not null
  from public.barberflow_establishments e
  join public.barberflow_products p on p.establishment_id=e.id
  left join public.barberflow_showcase_pix pix on pix.establishment_id=e.id
  cross join lateral (select barberflow_private.showcase_held(p.id) as units) held
  cross join (select (now() at time zone 'America/Sao_Paulo')::date as day) today
  where ((preview_shop is null and e.slug=profile_slug and e.published)
    or (preview_shop=e.id and e.owner_id=(select auth.uid())))
    and p.showcase and p.active and p.deleted_at is null and p.stock>held.units and p.price_cents>0
    and (p.expires_on is null or p.expires_on>=today.day)
  order by p.name,p.id;
$$;

create function public.barberflow_showcase_photo(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.barberflow_products p join public.barberflow_establishments e on e.id=p.establishment_id
    where e.published and p.showcase and p.active and p.deleted_at is null and p.price_cents>0
      and p.stock>barberflow_private.showcase_held(p.id)
      and (p.expires_on is null or p.expires_on>=(now() at time zone 'America/Sao_Paulo')::date)
      and object_name=e.id::text||'/'||p.id::text||'/'||split_part(object_name,'/',3)
      and split_part(object_name,'/',3) ~ '^foto-[1-5]$'
  );
$$;
create policy showcase_public_photos on storage.objects for select to anon,authenticated
  using(bucket_id='barberflow-product-photos' and public.barberflow_showcase_photo(name));

create function public.barberflow_preview_business(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'slug',coalesce(e.slug,''),'name',e.name,'city',e.city,'segment',e.segment,'description',e.public_description,
    'details',e.profile_details,'services',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'category',s.category,
        'price_cents',s.price_cents,'duration_minutes',s.duration_minutes,'professionals',coalesce((
          select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.photo_url) order by p.display_order,p.name,p.id)
          from public.barberflow_professional_services ps
          join public.barberflow_professionals p on p.establishment_id=ps.establishment_id and p.id=ps.professional_id
          where ps.establishment_id=e.id and ps.service_id=s.id and p.active
        ),'[]'::jsonb)) order by s.display_order,s.name,s.id)
      from public.barberflow_services s where s.establishment_id=e.id and s.active
    ),'[]'::jsonb)
  ) from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid());
$$;

create function public.barberflow_place_showcase_order(profile_slug text, item uuid, units integer, request_id uuid, quoted_cents integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  buyer uuid:=(select auth.uid()); customer text; shop record; product record; pix record;
  order_total bigint; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  select left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),'Cliente'),160) into customer
    from auth.users u where u.id=buyer and u.email_confirmed_at is not null
      and coalesce(u.banned_until,'-infinity')<=now() and not coalesce(u.is_anonymous,false);
  if customer is null then raise exception using errcode='42501',message='Active customer profile required'; end if;
  if units is null or units not between 1 and 100 or request_id is null then
    raise exception using errcode='22023',message='Invalid checkout';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(buyer::text,420));
  if exists(select 1 from public.barberflow_showcase_orders o where o.id=request_id and o.buyer_id=buyer) then
    return request_id;
  end if;
  if (select count(*) from public.barberflow_showcase_orders o
    where o.buyer_id=buyer and o.status='pending' and o.expires_at>now())>=3 then
    raise exception using errcode='22023',message='Too many pending orders',detail='limit';
  end if;
  select e.id,e.name into shop from public.barberflow_establishments e where e.slug=profile_slug and e.published for share;
  if not found then raise exception using errcode='22023',message='Shop unavailable'; end if;
  select * into pix from public.barberflow_showcase_pix c where c.establishment_id=shop.id;
  if not found then raise exception using errcode='22023',message='Pix unavailable'; end if;
  select p.* into product from public.barberflow_products p where p.id=item and p.establishment_id=shop.id
    and p.active and p.deleted_at is null and p.showcase and p.price_cents>0
    and (p.expires_on is null or p.expires_on>=today) for update;
  if not found or product.stock-barberflow_private.showcase_held(item)<units then
    raise exception using errcode='22023',message='Product unavailable';
  end if;
  order_total:=units::bigint*product.price_cents;
  if product.promo_until>=today and product.promo_cents<product.promo_units::bigint*product.price_cents then
    order_total:=(units/product.promo_units)::bigint*product.promo_cents+(units%product.promo_units)::bigint*product.price_cents;
  end if;
  if order_total is distinct from quoted_cents::bigint or order_total not between 1 and 99999999 then
    raise exception using errcode='22023',message='Price changed or invalid',detail='price';
  end if;
  insert into public.barberflow_showcase_orders(id,establishment_id,product_id,buyer_id,buyer_name,shop_name,
    product_name,quantity,unit_price_cents,total_cents,pix_key,merchant,city,expires_at)
  values(request_id,shop.id,item,buyer,customer,shop.name,product.name,units,product.price_cents,order_total,
    pix.pix_key,pix.merchant,pix.city,now()+interval '20 minutes');
  return request_id;
end;
$$;

create function public.barberflow_update_showcase_order(shop uuid, order_id uuid, operation text, received_cents integer,
  reference text) returns boolean language plpgsql security definer set search_path='' as $$
declare
  purchase record; entry uuid:=gen_random_uuid(); actor uuid:=(select auth.uid());
begin
  perform barberflow_private.require_inventory_owner(shop);
  select * into purchase from public.barberflow_showcase_orders o
    where o.id=order_id and o.establishment_id=shop for update;
  if not found then return false; end if;
  if operation='confirm' and purchase.status='pending' then
    if received_cents is distinct from purchase.total_cents or reference is null
      or char_length(btrim(reference)) not between 6 and 100 then return false; end if;
    perform 1 from public.barberflow_products p where p.id=purchase.product_id for update;
    update public.barberflow_showcase_orders set status='paid',paid_at=now(),bank_reference=btrim(reference) where id=order_id;
    update public.barberflow_products p set stock=p.stock-purchase.quantity
      where p.id=purchase.product_id and p.stock>=purchase.quantity and p.deleted_at is null
        and (p.expires_on is null or p.expires_on>=(now() at time zone 'America/Sao_Paulo')::date);
    if not found then raise exception using errcode='22023',message='Stock unavailable'; end if;
    insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
      values(shop,purchase.product_id,-purchase.quantity,'Venda Pix na vitrine',actor);
    insert into barberflow_private.finance_entries(id,establishment_id,direction,description,category,due_on,amount_cents,created_by)
      values(entry,shop,'in','Vitrine Pix: '||purchase.product_name,'Vendas da vitrine',
        (now() at time zone 'America/Sao_Paulo')::date,purchase.total_cents,actor);
    insert into barberflow_private.finance_settlements(id,entry_id,amount_cents,recorded_by)
      values(gen_random_uuid(),entry,purchase.total_cents,actor);
    return true;
  elsif operation='read' and purchase.status<>'pending' then
    update public.barberflow_showcase_orders set read_at=coalesce(read_at,now()) where id=order_id;
    return true;
  elsif (operation='ready' and purchase.status='paid') or (operation='collected' and purchase.status='ready') then
    update public.barberflow_showcase_orders set status=operation,read_at=coalesce(read_at,now()) where id=order_id;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function barberflow_private.showcase_held(uuid),barberflow_private.keep_showcase_reservations()
  from public,anon,authenticated;
revoke all on function public.barberflow_showcase_products(text,uuid),public.barberflow_showcase_photo(text) from public;
grant execute on function public.barberflow_showcase_products(text,uuid),public.barberflow_showcase_photo(text) to anon,authenticated;
revoke all on function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer,text,text,boolean),
  public.barberflow_preview_business(uuid),public.barberflow_place_showcase_order(text,uuid,integer,uuid,integer),
  public.barberflow_update_showcase_order(uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer,text,text,boolean),
  public.barberflow_preview_business(uuid),public.barberflow_place_showcase_order(text,uuid,integer,uuid,integer),
  public.barberflow_update_showcase_order(uuid,uuid,text,integer,text) to authenticated;

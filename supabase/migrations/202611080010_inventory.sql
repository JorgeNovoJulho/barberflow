create table public.barberflow_products (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sku text not null default '' check (char_length(sku)<=60),
  price_cents integer not null check (price_cents between 0 and 99999999),
  stock integer not null default 0 check (stock between 0 and 1000000),
  active boolean not null default true,
  unique(establishment_id,id)
);
create unique index barberflow_products_sku on public.barberflow_products(establishment_id,lower(sku)) where sku<>'';

alter table public.barberflow_schedule add unique(establishment_id,id);

create table public.barberflow_order_products (
  establishment_id uuid not null,
  appointment_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 10000),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  primary key(appointment_id,product_id),
  foreign key(establishment_id,appointment_id) references public.barberflow_schedule(establishment_id,id),
  foreign key(establishment_id,product_id) references public.barberflow_products(establishment_id,id)
);

create table public.barberflow_receipts (
  appointment_id uuid primary key,
  establishment_id uuid not null,
  service_cents integer not null,
  products_cents bigint not null,
  total_cents bigint generated always as (service_cents+products_cents) stored,
  closed_at timestamptz not null default now(),
  foreign key(establishment_id,appointment_id) references public.barberflow_schedule(establishment_id,id)
);

create table public.barberflow_stock_movements (
  id bigint generated always as identity primary key,
  establishment_id uuid not null,
  product_id uuid not null,
  appointment_id uuid,
  delta integer not null check (delta<>0),
  reason text not null check (char_length(btrim(reason)) between 1 and 240),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key(establishment_id,product_id) references public.barberflow_products(establishment_id,id),
  foreign key(establishment_id,appointment_id) references public.barberflow_schedule(establishment_id,id)
);
create index barberflow_movements_shop_created on public.barberflow_stock_movements(establishment_id,created_at desc);

do $migration$
declare table_name text;
begin
  foreach table_name in array array['barberflow_products','barberflow_order_products','barberflow_receipts','barberflow_stock_movements'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public,anon,authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy "Owner reads inventory" on public.%I for select to authenticated
      using (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())))',table_name);
  end loop;
end;
$migration$;
grant insert(establishment_id,name,sku,price_cents), update(name,sku,price_cents,active) on public.barberflow_products to authenticated;
create policy "Owner creates products" on public.barberflow_products for insert to authenticated
  with check (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));
create policy "Owner edits products" on public.barberflow_products for update to authenticated
  using (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())))
  with check (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));

create function barberflow_private.require_inventory_owner(shop uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then
    raise exception using errcode='42501',message='Establishment unavailable';
  end if;
end;
$$;
revoke all on function barberflow_private.require_inventory_owner(uuid) from public,anon,authenticated;

create function public.barberflow_adjust_stock(shop uuid, product uuid, amount integer, note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop);
  if amount is null or amount=0 or amount not between -1000000 and 1000000 or note is null
    or char_length(btrim(note)) not between 1 and 240 then raise exception using errcode='22023',message='Invalid adjustment'; end if;
  update public.barberflow_products set stock=stock+amount where establishment_id=shop and id=product
    and stock+amount between 0 and 1000000;
  if not found then raise exception using errcode='22023',message='Stock unavailable'; end if;
  insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
    values (shop,product,amount,btrim(note),(select auth.uid()));
end;
$$;

create function public.barberflow_set_order_product(shop uuid, appointment uuid, product uuid, units integer)
returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
  perform barberflow_private.require_inventory_owner(shop);
  perform 1 from public.barberflow_schedule where establishment_id=shop and id=appointment
    and kind='appointment' and state in ('scheduled','completed') for update;
  if not found or exists(select 1 from public.barberflow_receipts where appointment_id=appointment) then
    raise exception using errcode='22023',message='Order is not editable';
  end if;
  if units is null or units not between 0 and 10000 then raise exception using errcode='22023',message='Invalid units'; end if;
  if units=0 then
    delete from public.barberflow_order_products where appointment_id=appointment and product_id=product and establishment_id=shop;
    return;
  end if;
  select name,price_cents into item from public.barberflow_products where establishment_id=shop and id=product and active;
  if not found then raise exception using errcode='22023',message='Product unavailable'; end if;
  insert into public.barberflow_order_products(establishment_id,appointment_id,product_id,product_name,quantity,unit_price_cents)
    values(shop,appointment,product,item.name,units,item.price_cents)
    on conflict(appointment_id,product_id) do update set quantity=excluded.quantity;
end;
$$;

create function public.barberflow_close_order(shop uuid, appointment uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare booked record; line record; subtotal bigint := 0; result bigint;
begin
  perform barberflow_private.require_inventory_owner(shop);
  select price_cents,state into booked from public.barberflow_schedule
    where establishment_id=shop and id=appointment and kind='appointment' for update;
  if not found or booked.state<>'completed' then raise exception using errcode='22023',message='Complete the appointment before closing'; end if;
  select total_cents into result from public.barberflow_receipts where establishment_id=shop and appointment_id=appointment;
  if found then return result; end if;

  for line in select * from public.barberflow_order_products
    where establishment_id=shop and appointment_id=appointment order by product_id loop
    update public.barberflow_products set stock=stock-line.quantity
      where establishment_id=shop and id=line.product_id and stock>=line.quantity;
    if not found then raise exception using errcode='22023',message='Insufficient stock'; end if;
    insert into public.barberflow_stock_movements(establishment_id,product_id,appointment_id,delta,reason,actor_id)
      values(shop,line.product_id,appointment,-line.quantity,'Venda na comanda',(select auth.uid()));
    subtotal := subtotal+line.quantity::bigint*line.unit_price_cents;
  end loop;
  insert into public.barberflow_receipts(appointment_id,establishment_id,service_cents,products_cents)
    values(appointment,shop,booked.price_cents,subtotal) returning total_cents into result;
  return result;
end;
$$;

revoke all on function public.barberflow_adjust_stock(uuid,uuid,integer,text),
  public.barberflow_set_order_product(uuid,uuid,uuid,integer),public.barberflow_close_order(uuid,uuid) from public,anon;
grant execute on function public.barberflow_adjust_stock(uuid,uuid,integer,text),
  public.barberflow_set_order_product(uuid,uuid,uuid,integer),public.barberflow_close_order(uuid,uuid) to authenticated;

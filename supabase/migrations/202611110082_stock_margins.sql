create table public.barberflow_stock_margins (
  shop uuid primary key references public.barberflow_establishments(id) on delete cascade,
  alta integer not null check (alta between 100 and 400),
  media integer not null check (media between 50 and 99),
  baixa integer not null check (baixa between 10 and 49)
);
alter table public.barberflow_stock_margins enable row level security;
grant select on public.barberflow_stock_margins to authenticated;
create policy stock_margins_read on public.barberflow_stock_margins for select to authenticated
using (exists (select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()));

create function public.barberflow_save_stock_margins(shop_id uuid, high_rate integer, medium_rate integer, low_rate integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop_id);
  if not barberflow_private.finance_unlocked(shop_id) then return false; end if;
  insert into public.barberflow_stock_margins(shop,alta,media,baixa) values(shop_id,high_rate,medium_rate,low_rate)
  on conflict(shop) do update set alta=excluded.alta,media=excluded.media,baixa=excluded.baixa;
  return true;
end;
$$;

alter table public.barberflow_products add column margin_tier text
  check (margin_tier in ('alta','media','baixa'));
grant update(margin_tier) on public.barberflow_products to authenticated;

create function barberflow_private.apply_stock_margin() returns trigger
language plpgsql security definer set search_path='' as $$
declare rate integer;
begin
  if new.margin_tier is null then return new; end if;
  if new.cost_cents is null or new.cost_cents<=0 then raise exception using errcode='22023',message='Cost required'; end if;
  select case new.margin_tier when 'alta' then m.alta when 'media' then m.media when 'baixa' then m.baixa end into rate
  from public.barberflow_stock_margins m where m.shop=new.establishment_id;
  rate:=coalesce(rate,case new.margin_tier when 'alta' then 100 when 'media' then 50 when 'baixa' then 10 end);
  new.price_cents:=round(new.cost_cents::numeric*(100+rate)/100);
  return new;
end;
$$;
create trigger apply_stock_margin before insert or update of margin_tier,cost_cents,price_cents on public.barberflow_products
for each row execute function barberflow_private.apply_stock_margin();

create function public.barberflow_create_priced_product(shop uuid, product_name text, product_sku text, sale_price integer,
  unit_cost integer, stock_floor integer, expiry date, initial_units integer, product_barcode text, product_description text,
  in_showcase boolean, tier text)
returns uuid language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
  perform barberflow_private.require_inventory_owner(shop);
  created:=public.barberflow_create_product(shop,product_name,product_sku,sale_price,unit_cost,stock_floor,expiry,
    initial_units,product_barcode,product_description,in_showcase);
  if tier is not null then
    update public.barberflow_products set margin_tier=tier where id=created and establishment_id=shop;
  end if;
  return created;
end;
$$;

create function public.barberflow_save_expiry_offer(shop uuid, product uuid, units integer, markup integer, until_day date)
returns boolean language plpgsql security definer set search_path='' as $$
declare item record; amount numeric;
begin
  perform barberflow_private.require_inventory_owner(shop);
  if units is null or units not in (3,5,10) or markup is null or markup not between 0 and 20 then return false; end if;
  select p.cost_cents,p.stock into item from public.barberflow_products p
  where p.id=product and p.establishment_id=shop and p.deleted_at is null for update;
  if not found or item.cost_cents is null or item.cost_cents<=0 or item.stock<units then return false; end if;
  amount:=round(item.cost_cents::numeric*units*(100+markup)/100);
  if amount>99999999 then return false; end if;
  return public.barberflow_save_product_promotion(shop,product,units,amount::integer,until_day);
end;
$$;
revoke all on function public.barberflow_save_stock_margins(uuid,integer,integer,integer),
  public.barberflow_create_priced_product(uuid,text,text,integer,integer,integer,date,integer,text,text,boolean,text),
  public.barberflow_save_expiry_offer(uuid,uuid,integer,integer,date) from public,anon;
grant execute on function public.barberflow_save_stock_margins(uuid,integer,integer,integer),
  public.barberflow_create_priced_product(uuid,text,text,integer,integer,integer,date,integer,text,text,boolean,text),
  public.barberflow_save_expiry_offer(uuid,uuid,integer,integer,date) to authenticated;

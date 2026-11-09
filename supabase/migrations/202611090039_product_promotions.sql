alter table public.barberflow_products
  add column barcode text not null default '' check (barcode ~ '^[0-9]{0,32}$'),
  add column promo_units integer,
  add column promo_cents integer,
  add column promo_until date,
  add constraint barberflow_product_promo_check check (
    (promo_units is null and promo_cents is null and promo_until is null)
    or (promo_units is not null and promo_units between 1 and 10000
      and promo_cents is not null and promo_cents between 1 and 99999999 and promo_until is not null)
  );

create unique index barberflow_products_barcode on public.barberflow_products(establishment_id,barcode)
  where barcode<>'' and deleted_at is null;
grant insert(barcode),update(barcode) on public.barberflow_products to authenticated;

alter table public.barberflow_order_products
  add column product_sku text,
  add column product_barcode text,
  add column promo_units integer,
  add column promo_cents integer,
  add column promo_until date,
  add column line_total_cents bigint generated always as (
    case when promo_units is null then quantity::bigint*unit_price_cents
      else (quantity/promo_units)::bigint*promo_cents+(quantity%promo_units)::bigint*unit_price_cents end
  ) stored;

drop function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer);

create function public.barberflow_search_products(shop uuid, search_text text)
returns setof public.barberflow_products language sql stable security invoker set search_path='' as $$
  select p.* from public.barberflow_products p
  where p.establishment_id=shop and p.deleted_at is null
    and char_length(search_text)<=120
    and (strpos(lower(p.name),lower(search_text))>0 or strpos(lower(p.sku),lower(search_text))>0
      or strpos(p.barcode,search_text)>0)
  order by p.name,p.id;
$$;
revoke all on function public.barberflow_search_products(uuid,text) from public,anon;
grant execute on function public.barberflow_search_products(uuid,text) to authenticated;

create function public.barberflow_create_product(shop uuid, product_name text, product_sku text, sale_price integer,
  unit_cost integer, stock_floor integer, expiry date, initial_units integer, product_barcode text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare product_id uuid;
begin
  if initial_units is null or initial_units not between 0 and 1000000 then
    raise exception using errcode='22023',message='Invalid initial stock';
  end if;
  insert into public.barberflow_products(establishment_id,name,sku,barcode,price_cents,cost_cents,minimum_stock,expires_on)
    values(shop,product_name,product_sku,product_barcode,sale_price,unit_cost,stock_floor,expiry) returning id into product_id;
  if initial_units > 0 then
    perform public.barberflow_adjust_stock(shop,product_id,initial_units,'Estoque inicial');
  end if;
  return product_id;
end;
$$;

create function public.barberflow_save_product_promotion(shop uuid, product uuid, bundle_units integer, bundle_cents integer, offer_until date)
returns boolean language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  perform barberflow_private.require_inventory_owner(shop);
  update public.barberflow_products p set promo_units=bundle_units,promo_cents=bundle_cents,promo_until=offer_until
  where p.establishment_id=shop and p.id=product and p.deleted_at is null and (
    (bundle_units is null and bundle_cents is null and offer_until is null)
    or (p.active and p.expires_on between today and today+30 and offer_until between today and p.expires_on
      and bundle_units between 1 and 10000 and bundle_cents between 1 and 99999999
      and bundle_cents<bundle_units::bigint*p.price_cents)
  );
  return found;
end;
$$;

revoke all on function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer,text),
  public.barberflow_save_product_promotion(uuid,uuid,integer,integer,date) from public,anon;
grant execute on function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer,text),
  public.barberflow_save_product_promotion(uuid,uuid,integer,integer,date) to authenticated;

create or replace function public.barberflow_set_order_product(shop uuid, appointment uuid, product uuid, units integer)
returns void language plpgsql security definer set search_path='' as $$
declare item record; normal_price integer; today date:=(now() at time zone 'America/Sao_Paulo')::date;
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
  select name,sku,barcode,price_cents,promo_units,promo_cents,
    case when expires_on is not null then least(expires_on,promo_until) end as offer_end into item
    from public.barberflow_products where establishment_id=shop and id=product and active and deleted_at is null for share;
  if not found then raise exception using errcode='22023',message='Product unavailable',detail='product_inactive'; end if;
  select coalesce((select l.unit_price_cents from public.barberflow_order_products l
    where l.appointment_id=appointment and l.product_id=product),item.price_cents) into normal_price;
  if item.offer_end is null or item.offer_end<today or item.promo_cents>=item.promo_units::bigint*normal_price then
    item.promo_units:=null;
    item.promo_cents:=null;
    item.offer_end:=null;
  end if;
  insert into public.barberflow_order_products(establishment_id,appointment_id,product_id,product_name,
    quantity,unit_price_cents,product_sku,product_barcode,promo_units,promo_cents,promo_until)
    values(shop,appointment,product,item.name,units,normal_price,item.sku,item.barcode,
      item.promo_units,item.promo_cents,case when item.promo_units is not null then item.offer_end end)
    on conflict(appointment_id,product_id) do update set quantity=excluded.quantity,
      product_sku=coalesce(barberflow_order_products.product_sku,excluded.product_sku),
      product_barcode=coalesce(barberflow_order_products.product_barcode,excluded.product_barcode),
      promo_units=excluded.promo_units,promo_cents=excluded.promo_cents,promo_until=excluded.promo_until;
end;
$$;

create or replace function public.barberflow_close_order(shop uuid, appointment uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; booked record; line record; subtotal bigint := 0; result bigint;
begin
  perform barberflow_private.require_inventory_owner(shop);
  select price_cents,state into booked from public.barberflow_schedule
    where establishment_id=shop and id=appointment and kind='appointment' for update;
  if not found or booked.state<>'completed' then raise exception using errcode='22023',message='Complete the appointment before closing'; end if;
  select total_cents into result from public.barberflow_receipts where establishment_id=shop and appointment_id=appointment;
  if found then return result; end if;

  for line in select * from public.barberflow_order_products
    where establishment_id=shop and appointment_id=appointment order by product_id loop
    if line.promo_units is not null and line.quantity>=line.promo_units and line.promo_until<today then
      raise exception using errcode='22023',message='Promotion expired',detail='promotion_expired';
    end if;
    update public.barberflow_products set stock=stock-line.quantity
      where establishment_id=shop and id=line.product_id and active and deleted_at is null and stock>=line.quantity
        and (line.promo_units is null or line.quantity<line.promo_units or expires_on>=today);
    if not found then raise exception using errcode='22023',message='Insufficient stock'; end if;
    insert into public.barberflow_stock_movements(establishment_id,product_id,appointment_id,delta,reason,actor_id)
      values(shop,line.product_id,appointment,-line.quantity,'Venda na comanda',(select auth.uid()));
    subtotal := subtotal+line.line_total_cents;
  end loop;
  insert into public.barberflow_receipts(appointment_id,establishment_id,service_cents,products_cents)
    values(appointment,shop,booked.price_cents,subtotal) returning total_cents into result;
  return result;
end;
$$;

create or replace function public.barberflow_performance_report(shop uuid, first_day date, last_day date, professional uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select first_day::timestamp as start_at,(last_day+1)::timestamp as end_at
    where barberflow_private.finance_report_unlocked(shop) and first_day between date '2000-01-01' and date '2099-12-31'
      and last_day between first_day and date '2099-12-31' and last_day-first_day<=365
  ), sales as (
    select (r.closed_at at time zone 'America/Sao_Paulo')::date as day,
      r.appointment_id,r.total_cents,r.service_cents,r.products_cents,r.commission_bps,r.product_commission_bps,
      a.service_id,a.service_name,a.professional_id,p.name as professional_name
    from bounds b
    join public.barberflow_receipts r on r.establishment_id=shop
      and r.closed_at >= (b.start_at at time zone 'America/Sao_Paulo')
      and r.closed_at < (b.end_at at time zone 'America/Sao_Paulo')
    join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=shop
    join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=shop
    where professional is null or a.professional_id=professional
  ), by_day as (
    select day,sum(total_cents) as cents from sales group by day
  ), by_professional as (
    select professional_id,professional_name as name,count(*) as quantity,sum(total_cents) as cents,
      count(*) filter(where commission_bps is null) as untracked,
      coalesce(sum(round(service_cents::numeric*commission_bps/10000)),0) as commission_cents,
      count(*) filter(where products_cents>0 and product_commission_bps is null) as untracked_products,
      coalesce(sum(round(products_cents::numeric*product_commission_bps/10000)),0) as product_commission_cents
    from sales group by professional_id,professional_name
  ), by_service as (
    select service_id,service_name as name,count(*) as quantity,sum(service_cents) as cents
    from sales group by service_id,service_name
    order by quantity desc,cents desc,service_id,service_name limit 10
  ), by_product as (
    select p.id as product_id,p.name,sum(l.quantity) as quantity,
      sum(l.line_total_cents) as cents
    from sales s
    join public.barberflow_order_products l on l.appointment_id=s.appointment_id and l.establishment_id=shop
    join public.barberflow_products p on p.id=l.product_id and p.establishment_id=shop
    group by p.id,p.name
    order by quantity desc,cents desc,p.id limit 10
  ), busy_hours as (
    select extract(dow from a.starts_at)::integer as weekday,extract(hour from a.starts_at)::integer as hour,
      count(*) as quantity
    from bounds b join public.barberflow_schedule a on a.establishment_id=shop
      and a.starts_at>=b.start_at and a.starts_at<b.end_at
    where a.kind='appointment' and a.state='completed' and (professional is null or a.professional_id=professional)
    group by 1,2 order by quantity desc,weekday,hour limit 10
  )
  select jsonb_build_object(
    'quantity',(select count(*) from sales),
    'cents',coalesce((select sum(total_cents) from sales),0),
    'ticket_cents',coalesce((select round(avg(total_cents)) from sales),0),
    'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from by_day d),'[]'::jsonb),
    'professionals',coalesce((select jsonb_agg(to_jsonb(p) order by p.cents desc,p.name,p.professional_id) from by_professional p),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(s) order by s.quantity desc,s.cents desc,s.service_id,s.name) from by_service s),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.quantity desc,p.cents desc,p.product_id) from by_product p),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.quantity desc,h.weekday,h.hour) from busy_hours h),'[]'::jsonb)
  ) from bounds;
$$;

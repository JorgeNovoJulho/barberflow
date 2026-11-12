alter table public.barberflow_products add column markup_percent integer check (markup_percent between 0 and 400);
grant select(markup_percent),update(markup_percent) on public.barberflow_products to authenticated;

create or replace function barberflow_private.apply_stock_margin() returns trigger
language plpgsql security definer set search_path='' as $$
declare rate integer;
begin
  if new.markup_percent is not null then
    rate := new.markup_percent;
    new.margin_tier := case when rate >= 100 then 'alta' when rate >= 50 then 'media' else 'baixa' end;
  elsif new.margin_tier is not null then
    select case new.margin_tier when 'alta' then m.alta when 'media' then m.media else m.baixa end into rate
    from public.barberflow_stock_margins m where m.shop=new.establishment_id;
    rate := coalesce(rate,case new.margin_tier when 'alta' then 100 when 'media' then 50 else 10 end);
  else
    return new;
  end if;
  if new.cost_cents is null or new.cost_cents<=0 then raise exception using errcode='22023',message='Cost required'; end if;
  new.price_cents := round(new.cost_cents::numeric*(100+rate)/100);
  return new;
end;
$$;
drop trigger apply_stock_margin on public.barberflow_products;
create trigger apply_stock_margin before insert or update of markup_percent,margin_tier,cost_cents,price_cents on public.barberflow_products
for each row execute function barberflow_private.apply_stock_margin();

create function public.barberflow_create_markup_product(shop uuid, product_name text, product_sku text, sale_price integer,
  unit_cost integer, stock_floor integer, expiry date, initial_units integer, product_barcode text, product_description text,
  in_showcase boolean, markup integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
  created := public.barberflow_create_priced_product(shop,product_name,product_sku,sale_price,unit_cost,
    stock_floor,expiry,initial_units,product_barcode,product_description,in_showcase,null);
  if markup is not null then
    update public.barberflow_products set markup_percent=markup where id=created and establishment_id=shop;
  end if;
  return created;
end;
$$;
revoke all on function public.barberflow_create_markup_product(uuid,text,text,integer,integer,integer,date,integer,text,text,boolean,integer) from public,anon;
grant execute on function public.barberflow_create_markup_product(uuid,text,text,integer,integer,integer,date,integer,text,text,boolean,integer) to authenticated;

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
    group by 1,2
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

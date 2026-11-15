alter table barberflow_private.counter_sales add column split_payments jsonb;

create function public.barberflow_counter_split_pix(shop_id uuid, sale_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('pix_key',p.pix_key,'merchant',p.merchant,'city',p.city)
  from barberflow_private.counter_sales s
  join public.barberflow_showcase_pix p on p.establishment_id=s.shop
  where s.shop=shop_id and s.id=sale_id and s.state='open'
    and public.barberflow_shop_access_state(shop_id) is distinct from 'blocked'
    and (barberflow_private.counter_allowed(shop_id)
      or s.walk_in_professional=barberflow_private.individual_professional(shop_id));
$$;

create function public.barberflow_collect_counter_split(shop_id uuid, sale_id uuid, revision integer, expected bigint,
  first_method text, first_amount bigint, second_method text, cash_received bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  sale barberflow_private.counter_sales%rowtype;
  second_amount bigint := expected-first_amount;
  result text;
begin
  if first_method is null or first_method not in ('pix','cash','debit','credit')
    or second_method is null or second_method not in ('pix','cash','debit','credit')
    or first_method=second_method or expected is null or first_amount is null
    or first_amount<=0 or second_amount<=0 then return false; end if;
  if (first_method='cash' and coalesce(cash_received,0)<first_amount)
    or (second_method='cash' and coalesce(cash_received,0)<second_amount) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(sale_id::text,0));
  select s.* into sale from barberflow_private.counter_sales s
    where s.shop=shop_id and s.id=sale_id and s.state='open'
      and (barberflow_private.counter_allowed(shop_id)
        or s.walk_in_professional=barberflow_private.individual_professional(shop_id))
    for update;
  if not found or sale.revision is distinct from revision
    or sale.service_cents+sale.product_cents is distinct from expected then return false; end if;
  if 'pix' in (first_method,second_method) and public.barberflow_counter_split_pix(shop_id,sale_id) is null
    then return false; end if;
  result := public.barberflow_save_counter_sale(shop_id,sale_id,revision,sale.client_name,sale.phone,
    sale.items,'charge',first_method,null,null);
  if result is distinct from 'ok' then return false; end if;
  result := public.barberflow_save_counter_sale(shop_id,sale_id,revision+1,sale.client_name,sale.phone,
    sale.items,'confirm',null,'split-'||sale_id::text,expected::integer);
  if result is distinct from 'ok' then raise exception 'Não foi possível confirmar as duas partes'; end if;
  update barberflow_private.counter_sales s set split_payments=jsonb_build_array(
    jsonb_build_object('method',first_method,'amount',first_amount),
    jsonb_build_object('method',second_method,'amount',second_amount))
  where s.id=sale_id and s.shop=shop_id;
  return true;
end;
$$;
revoke all on function public.barberflow_counter_split_pix(uuid,uuid),
  public.barberflow_collect_counter_split(uuid,uuid,integer,bigint,text,bigint,text,bigint) from public,anon;
grant execute on function public.barberflow_counter_split_pix(uuid,uuid),
  public.barberflow_collect_counter_split(uuid,uuid,integer,bigint,text,bigint,text,bigint) to authenticated;

create or replace function public.barberflow_counter_report(shop_id uuid, period text, item_filter text, page_number integer)
returns jsonb language sql stable security definer set search_path='' as $$
  with today as (select (now() at time zone barberflow_private.counter_timezone(shop_id))::date as day),
  dates as (
    select case period
      when 'semana' then date_trunc('week',day)::date
      when 'quinzena' then date_trunc('month',day)::date+case when extract(day from day)>15 then 15 else 0 end
      when 'mes' then date_trunc('month',day)::date
      when 'trimestre' then date_trunc('quarter',day)::date
      when 'semestre' then make_date(extract(year from day)::integer,case when extract(month from day)<7 then 1 else 7 end,1)
      when 'ano' then date_trunc('year',day)::date else day end as first_day, day+1 as end_day
    from today
  ), paid as (
    select s.*,case item_filter when 'servicos' then s.service_cents when 'produtos' then s.product_cents
      else s.service_cents+s.product_cents end as amount
    from barberflow_private.counter_sales s join barberflow_private.finance_settlements fs on fs.id=s.id and fs.entry_id=s.id
    cross join dates d where s.shop=shop_id and s.state='paid' and fs.reversed_at is null
      and s.paid_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and s.paid_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  ), allocated as (
    select p.*,part.method as payment_method,
      case when part.position=1 then round(p.amount::numeric*part.cents/nullif(p.service_cents+p.product_cents,0))
        else p.amount-round(p.amount::numeric*(p.service_cents+p.product_cents-part.cents)/nullif(p.service_cents+p.product_cents,0)) end as payment_amount
    from paid p cross join lateral (
      select item->>'method' as method,(item->>'amount')::bigint as cents,position
      from jsonb_array_elements(coalesce(p.split_payments,jsonb_build_array(
        jsonb_build_object('method',p.method,'amount',p.service_cents+p.product_cents)))) with ordinality as items(item,position)
    ) part
  ), older_payments as (
    select p.method,
      case item_filter when 'servicos' then round(p.amount_cents::numeric*r.service_cents/nullif(r.total_cents,0))
        when 'produtos' then round(p.amount_cents::numeric*r.products_cents/nullif(r.total_cents,0)) else p.amount_cents end as amount
    from barberflow_private.receipt_payments p join public.barberflow_receipts r on r.appointment_id=p.appointment_id
    cross join dates d where r.establishment_id=shop_id and p.reversed_at is null and p.method in ('pix','card')
      and p.recorded_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and p.recorded_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  ), storefront as (
    select coalesce(sum(o.total_cents),0) as amount,coalesce(sum(o.quantity),0) as units
    from public.barberflow_showcase_orders o cross join dates d
    where o.establishment_id=shop_id and o.status in ('paid','ready','collected')
      and o.paid_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and o.paid_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  ), schedule as (
    select a.state,count(*) as count from public.barberflow_schedule a cross join dates d
    where a.establishment_id=shop_id and a.kind='appointment' and a.state in ('completed','cancelled','no_show','pending')
      and (a.starts_at at time zone 'America/Sao_Paulo')>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and (a.starts_at at time zone 'America/Sao_Paulo')<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id) group by a.state
  ), units as (
    select coalesce(sum((item->>'units')::integer),0) as counter_units from paid
    cross join lateral jsonb_array_elements(paid.items) as item where item->>'kind'='product'
  ), legacy_units as (
    select coalesce(sum(o.quantity),0) as appointment_units
    from public.barberflow_order_products o join public.barberflow_receipts r using (appointment_id,establishment_id)
    cross join dates d where r.establishment_id=shop_id
      and r.closed_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and r.closed_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  )
  select jsonb_build_object('first',d.first_day,'last',d.end_day-1,
    'pix',coalesce((select sum(payment_amount) from allocated where payment_method in ('pix','cash')),0)+coalesce((select sum(amount) from older_payments where method='pix'),0)
      +case when item_filter='servicos' then 0 else (select amount from storefront) end,
    'debit',coalesce((select sum(payment_amount) from allocated where payment_method='debit'),0),
    'credit',coalesce((select sum(payment_amount) from allocated where payment_method='credit'),0),
    'legacy_card',coalesce((select sum(amount) from older_payments where method='card'),0),
    'states',case when item_filter='produtos' then '{}'::jsonb else coalesce((select jsonb_object_agg(state,count) from schedule),'{}') end,
    'units',case when item_filter='servicos' then 0 else (select counter_units from units)+(select appointment_units from legacy_units)+(select units from storefront) end,
    'rows',coalesce((select jsonb_agg(to_jsonb(s)-'pix'||jsonb_build_object('method',s.payment_method,'amount',s.payment_amount) order by s.paid_at desc,s.id) from (
      select * from allocated where payment_method in ('debit','credit') and payment_amount>0 order by paid_at desc,id
      limit 31 offset greatest(0,least(page_number,10000))*30
    ) s),'[]'))
  from dates d where barberflow_private.counter_allowed(shop_id)
    and period in ('dia','semana','quinzena','mes','trimestre','semestre','ano')
    and item_filter in ('servicos','produtos','ambos');
$$;

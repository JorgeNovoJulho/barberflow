create function public.barberflow_monthly_costs(shop_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with shop as (
    select e.checkout_timezone as tz, (now() at time zone e.checkout_timezone)::date as today
    from public.barberflow_establishments e
    where e.id=shop_id and barberflow_private.finance_unlocked(shop_id)
  ), bounds as (
    select date_trunc('month',today)::date as first,
      (date_trunc('month',today)+interval '1 month')::date as ending, tz, today
    from shop
  ), appointments as (
    select r.* from public.barberflow_receipts r cross join bounds b
    where r.establishment_id=shop_id and r.closed_at>=b.first::timestamp at time zone b.tz
      and r.closed_at<b.ending::timestamp at time zone b.tz
  ), counter as (
    select s.items from barberflow_private.counter_sales s cross join bounds b
    join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null
    where s.shop=shop_id and s.state='paid' and s.paid_at>=b.first::timestamp at time zone b.tz
      and s.paid_at<b.ending::timestamp at time zone b.tz
  ), counter_items as (
    select i->>'kind' as kind, (i->>'id')::uuid as id, i->>'name' as name,
      (i->>'units')::bigint as units, (i->>'price')::bigint as price
    from counter c cross join lateral jsonb_array_elements(c.items) i
  ), sold as (
    select l.product_id as id,l.quantity::bigint as units,l.line_total_cents::bigint as cents
    from appointments a join public.barberflow_order_products l on l.appointment_id=a.appointment_id and l.establishment_id=shop_id
    union all
    select id,units,units*price from counter_items where kind='product'
    union all
    select o.product_id,o.quantity,o.total_cents from public.barberflow_showcase_orders o cross join bounds b
    where o.establishment_id=shop_id and o.status in ('paid','ready','collected')
      and o.paid_at>=b.first::timestamp at time zone b.tz and o.paid_at<b.ending::timestamp at time zone b.tz
  ), products as (
    select p.id,p.name,sum(s.units) as quantity,sum(s.cents) as cents,
      sum(s.units)*p.cost_cents as replacement
    from sold s join public.barberflow_products p on p.id=s.id and p.establishment_id=shop_id
    group by p.id,p.name,p.cost_cents
  ), service_sales as (
    select a.service_id as id,a.service_name as name,1::bigint as units,
      (r.service_cents-coalesce((select sum(l.price_cents) from public.barberflow_order_services l
        where l.appointment_id=r.appointment_id and l.establishment_id=shop_id),0))::bigint as cents
    from appointments r join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=shop_id
    union all
    select l.service_id,l.service_name,1,l.price_cents
    from appointments r join public.barberflow_order_services l on l.appointment_id=r.appointment_id and l.establishment_id=shop_id
    union all
    select id,name,units,units*price from counter_items where kind='service'
  ), services as (
    select id,max(name) as name,sum(units) as quantity,sum(cents) as cents from service_sales
    group by id order by quantity desc,cents desc,id limit 3
  ), expenses as (
    select coalesce(sum(e.amount_cents),0) as cents from barberflow_private.finance_entries e cross join bounds b
    where e.establishment_id=shop_id and e.direction='out' and e.expense_type in ('fixed','variable','reinvestment')
      and e.due_on>=b.first and e.due_on<b.ending
  )
  select jsonb_build_object(
    'days',b.ending-b.first,'today',b.today,'expenses',(select cents from expenses),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.quantity desc,p.cents desc,p.id) from products p),'[]'),
    'services',coalesce((select jsonb_agg(to_jsonb(s) order by s.quantity desc,s.cents desc,s.id) from services s),'[]')
  ) from bounds b;
$$;
revoke all on function public.barberflow_monthly_costs(uuid) from public,anon;
grant execute on function public.barberflow_monthly_costs(uuid) to authenticated;

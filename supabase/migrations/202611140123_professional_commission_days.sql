create function public.barberflow_professional_commission_days(shop_id uuid, reference_year integer)
returns table(day date, pending bigint, settled bigint)
language sql stable security definer set search_path='' as $$
  with bounds as (
    select e.checkout_timezone as tz, barberflow_private.individual_professional(e.id) as person,
      make_date(reference_year,1,1) as first_day, make_date(reference_year+1,1,1) as end_day
    from public.barberflow_establishments e
    where e.id=shop_id and reference_year between 2000 and 2100
  ), orders as (
    select r.appointment_id as id, 'agenda' as origin, (r.closed_at at time zone b.tz)::date as earned_day,
      round(r.service_cents::numeric*r.commission_bps/10000)
      + round(r.products_cents::numeric*coalesce(r.product_commission_bps,0)/10000) as amount
    from bounds b join public.barberflow_schedule a on a.establishment_id=shop_id and a.professional_id=b.person
    join public.barberflow_receipts r on r.appointment_id=a.id and r.establishment_id=shop_id
    where a.state='completed' and r.closed_at>=b.first_day::timestamp at time zone b.tz
      and r.closed_at<b.end_day::timestamp at time zone b.tz
      and r.total_cents<=coalesce((select sum(p.amount_cents) from barberflow_private.receipt_payments p
        where p.appointment_id=r.appointment_id and p.reversed_at is null),0)
    union all
    select s.id,'balcao',(s.paid_at at time zone b.tz)::date,
      round(s.service_cents::numeric*c.service_bps/10000)+round(s.product_cents::numeric*c.product_bps/10000)
    from bounds b join barberflow_private.counter_commission c on c.professional_id=b.person
    join barberflow_private.counter_sales s on s.id=c.sale_id and s.shop=shop_id
    join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null
    where s.state='paid' and s.paid_at>=b.first_day::timestamp at time zone b.tz
      and s.paid_at<b.end_day::timestamp at time zone b.tz
  )
  select o.earned_day,
    coalesce(sum(o.amount) filter(where l.receipt_id is null),0)::bigint,
    coalesce(sum(o.amount) filter(where l.receipt_id is not null),0)::bigint
  from orders o left join barberflow_private.commission_receipt_orders l
    on l.shop=shop_id and l.origin=o.origin and l.order_id=o.id
  where o.amount>0 group by o.earned_day order by o.earned_day;
$$;
revoke all on function public.barberflow_professional_commission_days(uuid,integer) from public,anon;
grant execute on function public.barberflow_professional_commission_days(uuid,integer) to authenticated;

create or replace function public.barberflow_commission_report(shop_id uuid, period text, reference_day date)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select e.name, e.checkout_timezone as tz,
      coalesce(reference_day,(now() at time zone e.checkout_timezone)::date) as day
    from public.barberflow_establishments e where e.id=shop_id
      and barberflow_private.counter_allowed(shop_id) and period in ('dia','semana','quinzena','mes')
  ), dates as (
    select name,tz,
      case period when 'semana' then date_trunc('week',day)::date
        when 'quinzena' then date_trunc('month',day)::date+case when extract(day from day)>15 then 15 else 0 end
        when 'mes' then date_trunc('month',day)::date else day end as first,
      case period when 'semana' then date_trunc('week',day)::date+7
        when 'quinzena' then case when extract(day from day)<=15 then date_trunc('month',day)::date+15 else (date_trunc('month',day)+interval '1 month')::date end
        when 'mes' then (date_trunc('month',day)+interval '1 month')::date else day+1 end as ending
    from bounds
  ), orders as (
    select r.appointment_id as id,a.professional_id,
      coalesce(n.number,upper(left(r.appointment_id::text,8))) as number,
      r.closed_at as closed,case when (a.booked_by is not null or a.guest_online) then 'online' else 'porta' end as origin,
      jsonb_build_array(jsonb_build_object('name',a.service_name,'kind','service','units',1,'price',r.service_cents-extra.cents)) || extra.items
        || coalesce((select jsonb_agg(jsonb_build_object('name',l.product_name,'kind','product','units',l.quantity,'price',l.unit_price_cents) order by l.product_id)
          from public.barberflow_order_products l where l.appointment_id=r.appointment_id and l.establishment_id=shop_id),'[]') as items,
      round(r.service_cents::numeric*r.commission_bps/10000) as service_commission,
      case when r.products_cents=0 then 0 else round(r.products_cents::numeric*r.product_commission_bps/10000) end as product_commission
    from public.barberflow_receipts r
    join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=r.establishment_id
    left join barberflow_private.appointment_order_numbers n on n.appointment_id=r.appointment_id
    cross join lateral (
      select coalesce(sum(s.price_cents),0) as cents,
        coalesce(jsonb_agg(jsonb_build_object('name',s.service_name,'kind','service','units',1,'price',s.price_cents) order by s.service_id),'[]') as items
      from public.barberflow_order_services s where s.appointment_id=r.appointment_id
    ) extra
    cross join dates d
    where r.establishment_id=shop_id and a.state='completed'
      and r.total_cents <= coalesce((select sum(payment.amount_cents)
        from barberflow_private.receipt_payments payment
        where payment.appointment_id=r.appointment_id and payment.reversed_at is null),0)
      and r.closed_at>=d.first::timestamp at time zone d.tz and r.closed_at<d.ending::timestamp at time zone d.tz
    union all
    select s.id,c.professional_id,s.number,s.paid_at,'balcao',s.items,
      round(s.service_cents::numeric*c.service_bps/10000),
      round(s.product_cents::numeric*c.product_bps/10000)
    from barberflow_private.counter_sales s
    join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null
    left join barberflow_private.counter_commission c on c.sale_id=s.id
    cross join dates d
    where s.shop=shop_id and s.state='paid' and s.paid_at>=d.first::timestamp at time zone d.tz and s.paid_at<d.ending::timestamp at time zone d.tz
  )
  select jsonb_build_object('shop',d.name,'timezone',d.tz,'first',d.first,'last',d.ending-1,
    'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('receipt_id',link.receipt_id) order by o.closed,o.id)
      from orders o left join barberflow_private.commission_receipt_orders link
      on link.shop=shop_id and link.order_id=o.id and link.origin=case when o.origin='balcao' then 'balcao' else 'agenda' end),'[]'),
    'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
      from public.barberflow_professionals p where p.establishment_id=shop_id),'[]'))
  from dates d;
$$;

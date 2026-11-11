create or replace function public.barberflow_dashboard(shop uuid, period_days integer)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select (now() at time zone 'America/Sao_Paulo') as local_now,
      (now() at time zone 'America/Sao_Paulo')::date as today
    from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) and period_days in (1,7,30)
  ), report_window as (
    select local_now,today,today-(period_days-1) as first_day,today+1 as last_day
    from bounds
  ), appointments as (
    select a.* from public.barberflow_schedule a cross join report_window w
    where a.establishment_id=shop and a.kind='appointment'
      and a.starts_at>=w.first_day::timestamp and a.starts_at<w.last_day::timestamp
  ), metrics as (
    select count(*) as appointments,
      count(*) filter(where a.state='completed') as completed,
      count(*) filter(where a.state='cancelled') as cancelled,
      count(*) filter(where a.state='no_show') as no_show,
      count(*) filter(where a.state='pending') as pending,
      count(*) filter(where a.booked_by is not null or a.guest_online) as online,
      coalesce(sum(a.price_cents) filter(where a.state in ('scheduled','pending')),0) as scheduled_cents
    from appointments a
  ), sales as (
    select count(*) as closed_orders,coalesce(sum(r.total_cents),0) as closed_cents
    from public.barberflow_receipts r cross join report_window w
    where r.establishment_id=shop
      and r.closed_at >= (w.first_day::timestamp at time zone 'America/Sao_Paulo')
      and r.closed_at < (w.last_day::timestamp at time zone 'America/Sao_Paulo')
  ), confirmed_payments as (
    select p.amount_cents as amount,p.recorded_at as paid_at
    from barberflow_private.receipt_payments p join public.barberflow_receipts r using (appointment_id)
    cross join report_window w where r.establishment_id=shop and p.reversed_at is null
      and p.recorded_at>=w.first_day::timestamp at time zone 'America/Sao_Paulo'
      and p.recorded_at<w.last_day::timestamp at time zone 'America/Sao_Paulo'
    union all
    select f.amount_cents,c.paid_at from barberflow_private.counter_sales c
    join barberflow_private.finance_settlements f on f.id=c.id and f.entry_id=c.id
    cross join report_window w where c.shop=$1 and c.state='paid' and f.reversed_at is null
      and c.paid_at>=w.first_day::timestamp at time zone 'America/Sao_Paulo'
      and c.paid_at<w.last_day::timestamp at time zone 'America/Sao_Paulo'
    union all
    select o.total_cents,o.paid_at from public.barberflow_showcase_orders o
    cross join report_window w where o.establishment_id=shop and o.status in ('paid','ready','collected')
      and o.paid_at>=w.first_day::timestamp at time zone 'America/Sao_Paulo'
      and o.paid_at<w.last_day::timestamp at time zone 'America/Sao_Paulo'
  ), confirmed_revenue as (
    select coalesce(sum(amount),0) as confirmed_cents from confirmed_payments
  ), previous as (
    select count(*) as previous_appointments
    from public.barberflow_schedule a cross join report_window w
    where a.establishment_id=shop and a.kind='appointment'
      and a.starts_at>=(w.first_day-period_days)::timestamp and a.starts_at<w.first_day::timestamp
  ), today_stats as (
    select count(*) filter(where a.starts_at>=b.today::timestamp and a.state in ('scheduled','pending','completed','no_show')) as marked_today,
      count(*) filter(where a.starts_at>=b.today::timestamp and a.state='completed') as completed_today,
      count(*) filter(where a.state='scheduled' and a.starts_at<=b.local_now and a.ends_at>b.local_now) as in_progress,
      count(*) filter(where a.starts_at>=b.today::timestamp and a.state='pending') as pending_today
    from public.barberflow_schedule a cross join bounds b
    where a.establishment_id=shop and a.kind='appointment'
      and a.ends_at>b.today::timestamp and a.starts_at<(b.today+1)::timestamp
  ), slot_service as (
    select s.id,s.name from public.barberflow_services s cross join bounds
    where s.establishment_id=shop and s.active
      and exists (select 1 from public.barberflow_professional_services ps
        join public.barberflow_professionals p on p.id=ps.professional_id and p.establishment_id=shop and p.active
        where ps.establishment_id=shop and ps.service_id=s.id)
    order by s.display_order,s.name,s.id limit 1
  ), today_slots as (
    select s.name,count(distinct x.slot) as quantity from slot_service s cross join bounds b
    join public.barberflow_establishments e on e.id=shop and e.published
    left join public.barberflow_professional_services ps on ps.service_id=s.id and ps.establishment_id=shop
    left join lateral public.barberflow_public_slots(e.slug,ps.professional_id,s.id,b.today) x on true
    group by s.name
  ), today_cash as (
    select coalesce(sum(p.amount),0) as received_today
    from confirmed_payments p cross join bounds b
    where p.paid_at>=b.today::timestamp at time zone 'America/Sao_Paulo'
  ), upcoming as (
    select a.id,a.starts_at,a.client_name,a.service_name,a.state,p.name as professional_name,p.photo_url as professional_photo
    from public.barberflow_schedule a join public.barberflow_professionals p
      on p.establishment_id=a.establishment_id and p.id=a.professional_id cross join bounds b
    where a.establishment_id=shop and a.kind='appointment'
      and a.state in ('scheduled','pending') and a.starts_at>=b.local_now
    order by a.starts_at,a.id limit 8
  )
  select jsonb_build_object('first_day',w.first_day,'today',w.today)
    || to_jsonb(m) || to_jsonb(revenue) || to_jsonb(s) || to_jsonb(pr) || to_jsonb(t)
    || jsonb_build_object(
      'free_slots',(select quantity from today_slots),
      'slot_service',(select name from today_slots),
      'received_today',case when barberflow_private.finance_unlocked(shop) then (select received_today from today_cash) end,
      'upcoming_count',(select count(*) from public.barberflow_schedule a where a.establishment_id=shop
        and a.kind='appointment' and a.state in ('scheduled','pending') and a.starts_at>=w.local_now),
      'active_clients',(select count(*) from public.barberflow_clients c where c.establishment_id=shop and c.active),
      'upcoming',coalesce((select jsonb_agg(to_jsonb(u) order by u.starts_at,u.id) from upcoming u),'[]'::jsonb)
    )
  from report_window w cross join metrics m cross join sales s cross join confirmed_revenue revenue cross join previous pr cross join today_stats t;
$$;

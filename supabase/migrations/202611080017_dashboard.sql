create function public.barberflow_dashboard(shop uuid, period_days integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bounds as (
    select (now() at time zone 'America/Sao_Paulo') as local_now,
      (now() at time zone 'America/Sao_Paulo')::date as today
    from public.barberflow_establishments e where e.id=shop and period_days in (1,7,30)
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
      count(*) filter(where a.booked_by is not null) as online,
      coalesce(sum(a.price_cents) filter(where a.state in ('scheduled','pending')),0) as scheduled_cents
    from appointments a
  ), sales as (
    select count(*) as closed_orders,coalesce(sum(r.total_cents),0) as closed_cents
    from public.barberflow_receipts r cross join report_window w
    where r.establishment_id=shop
      and r.closed_at >= (w.first_day::timestamp at time zone 'America/Sao_Paulo')
      and r.closed_at < (w.last_day::timestamp at time zone 'America/Sao_Paulo')
  ), upcoming as (
    select a.id,a.starts_at,a.client_name,a.service_name,a.state,p.name as professional_name
    from public.barberflow_schedule a join public.barberflow_professionals p
      on p.establishment_id=a.establishment_id and p.id=a.professional_id cross join bounds b
    where a.establishment_id=shop and a.kind='appointment'
      and a.state in ('scheduled','pending') and a.starts_at>=b.local_now
    order by a.starts_at,a.id limit 8
  )
  select jsonb_build_object('first_day',w.first_day,'today',w.today)
    || to_jsonb(m) || to_jsonb(s)
    || jsonb_build_object(
      'active_clients',(select count(*) from public.barberflow_clients c where c.establishment_id=shop and c.active),
      'upcoming',coalesce((select jsonb_agg(to_jsonb(u) order by u.starts_at,u.id) from upcoming u),'[]'::jsonb)
    )
  from report_window w cross join metrics m cross join sales s;
$$;
revoke all on function public.barberflow_dashboard(uuid,integer) from public,anon;
grant execute on function public.barberflow_dashboard(uuid,integer) to authenticated;

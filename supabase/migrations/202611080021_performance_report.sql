create function public.barberflow_performance_report(shop uuid, first_day date, last_day date, professional uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select first_day::timestamp as start_at,(last_day+1)::timestamp as end_at
    where barberflow_private.finance_unlocked(shop) and first_day between date '2000-01-01' and date '2099-12-31'
      and last_day between first_day and date '2099-12-31' and last_day-first_day<=365
  ), sales as (
    select (r.closed_at at time zone 'America/Sao_Paulo')::date as day,
      r.total_cents,r.service_cents,a.service_id,a.service_name,a.professional_id,p.name as professional_name
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
    select professional_id,professional_name as name,count(*) as quantity,sum(total_cents) as cents
    from sales group by professional_id,professional_name
  ), by_service as (
    select service_id,service_name as name,count(*) as quantity,sum(service_cents) as cents
    from sales group by service_id,service_name
    order by quantity desc,cents desc,service_id,service_name limit 10
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
    'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.quantity desc,h.weekday,h.hour) from busy_hours h),'[]'::jsonb)
  ) from bounds;
$$;

revoke all on function public.barberflow_performance_report(uuid,date,date,uuid) from public,anon;
grant execute on function public.barberflow_performance_report(uuid,date,date,uuid) to authenticated;

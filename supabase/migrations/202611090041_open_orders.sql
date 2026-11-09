create function public.barberflow_open_orders(shop uuid, period_days integer, page_number integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bounds as (
    select (now() at time zone 'America/Sao_Paulo')::date as today,
      (now() at time zone 'America/Sao_Paulo') as local_now
    where period_days in (0,1,7,30) and page_number between 1 and 1000000
  ), matching as (
    select a.id as appointment_id,a.starts_at,a.client_name,a.service_name,a.professional_id,
      coalesce(a.price_cents,0) as service_cents,
      case when a.state='completed' then 'awaiting_close'
        when a.starts_at<=b.local_now and a.ends_at>b.local_now then 'current'
        when a.ends_at<=b.local_now then 'awaiting_status' else 'scheduled' end as stage
    from public.barberflow_schedule a cross join bounds b
    where a.establishment_id=shop and a.kind='appointment' and a.state in ('scheduled','completed')
      and not exists(select 1 from public.barberflow_receipts r where r.establishment_id=shop and r.appointment_id=a.id)
      and (period_days=0 or (a.starts_at>=(b.today-(period_days-1))::timestamp and a.starts_at<(b.today+1)::timestamp))
  ), ranked as (
    select *,case stage when 'current' then 0 when 'awaiting_close' then 1 when 'awaiting_status' then 2 else 3 end as priority
    from matching
  ), entries as (
    select * from ranked order by priority,starts_at,appointment_id
    limit 25 offset ((greatest(page_number,1)::bigint-1)*25)
  )
  select jsonb_build_object(
    'count',(select count(*) from matching),
    'items',coalesce((select jsonb_agg(jsonb_build_object('appointment_id',a.appointment_id,
      'starts_at',a.starts_at,'stage',a.stage,'client_name',a.client_name,'service_name',a.service_name,
      'professional_name',p.name,'total_cents',a.service_cents+items.cents,'product_units',items.units)
      order by a.priority,a.starts_at,a.appointment_id)
      from entries a join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=shop
      cross join lateral (
        select coalesce(sum(l.line_total_cents),0) as cents,coalesce(sum(l.quantity),0) as units
        from public.barberflow_order_products l where l.establishment_id=shop and l.appointment_id=a.appointment_id
      ) items),'[]'::jsonb)
  );
$$;

revoke all on function public.barberflow_open_orders(uuid,integer,integer) from public,anon;
grant execute on function public.barberflow_open_orders(uuid,integer,integer) to authenticated;

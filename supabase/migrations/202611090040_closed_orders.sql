create index barberflow_receipts_shop_closed_idx on public.barberflow_receipts(establishment_id,closed_at desc,appointment_id desc);

create function public.barberflow_closed_orders(shop uuid, period_days integer, page_number integer)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bounds as (
    select (now() at time zone 'America/Sao_Paulo')::date as today
    where period_days in (0,1,7,30) and page_number between 1 and 1000000
  ), matching as (
    select r.appointment_id,r.closed_at,r.total_cents
    from public.barberflow_receipts r cross join bounds b
    where r.establishment_id=shop and (period_days=0 or (
      r.closed_at>=((b.today-(period_days-1))::timestamp at time zone 'America/Sao_Paulo')
      and r.closed_at<((b.today+1)::timestamp at time zone 'America/Sao_Paulo')))
  ), entries as (
    select * from matching order by closed_at desc,appointment_id desc
    limit 25 offset ((greatest(page_number,1)::bigint-1)*25)
  )
  select jsonb_build_object(
    'count',(select count(*) from matching),
    'items',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('client_name',a.client_name,
      'service_name',a.service_name,'professional_name',p.name) order by r.closed_at desc,r.appointment_id desc)
      from entries r join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=shop
      join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=shop),'[]'::jsonb)
  );
$$;

create function public.barberflow_order_payments(shop uuid, appointment uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'received_cents',coalesce(sum(p.amount_cents) filter(where p.reversed_at is null),0),
    'payments',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount_cents',p.amount_cents,'method',p.method,
      'recorded_at',p.recorded_at,'reversed_at',p.reversed_at,'reversal_reason',p.reversal_reason)
      order by p.recorded_at desc,p.id) filter(where p.id is not null),'[]'::jsonb)
  )
  from public.barberflow_receipts r
  left join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
  where r.establishment_id=shop and r.appointment_id=appointment and barberflow_private.finance_unlocked(shop)
  group by r.appointment_id;
$$;

revoke all on function public.barberflow_closed_orders(uuid,integer,integer),public.barberflow_order_payments(uuid,uuid) from public,anon;
grant execute on function public.barberflow_closed_orders(uuid,integer,integer),public.barberflow_order_payments(uuid,uuid) to authenticated;

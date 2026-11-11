create function public.barberflow_receivables(shop uuid, bill_view text, page_number integer)
returns jsonb language sql stable security definer set search_path='' as $$
  with bills as (
    select r.appointment_id,r.closed_at,r.total_cents,a.client_name,
      coalesce(sum(p.amount_cents) filter(where p.reversed_at is null),0) as received_cents
    from public.barberflow_receipts r join public.barberflow_schedule a on a.id=r.appointment_id
    left join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
    where r.establishment_id=shop and barberflow_private.finance_unlocked(shop)
    group by r.appointment_id,r.closed_at,r.total_cents,a.client_name
  ), recent as (
    select * from bills where (total_cents>received_cents)=(bill_view='abertas')
    order by closed_at desc,appointment_id
    limit 25 offset least(greatest(coalesce(page_number,0),0),10000)*24
  )
  select jsonb_build_object(
    'open_cents',(select coalesce(sum(total_cents-received_cents),0) from bills),
    'cash_cents',(select coalesce(sum(received_cents),0) from bills),
    'bills',coalesce((
      select jsonb_agg(to_jsonb(r)||jsonb_build_object('payments',coalesce((
        select jsonb_agg(jsonb_build_object('id',p.id,'amount_cents',p.amount_cents,'method',p.method,'recorded_at',p.recorded_at,
          'reversed_at',p.reversed_at,'reversal_reason',p.reversal_reason) order by p.recorded_at desc,p.id)
        from barberflow_private.receipt_payments p where p.appointment_id=r.appointment_id
      ),'[]'::jsonb)) order by r.closed_at desc,r.appointment_id) from recent r
    ),'[]'::jsonb))
  where barberflow_private.finance_unlocked(shop) and bill_view in ('abertas','fechadas');
$$;
revoke all on function public.barberflow_receivables(uuid,text,integer) from public,anon;
grant execute on function public.barberflow_receivables(uuid,text,integer) to authenticated;

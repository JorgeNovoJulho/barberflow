alter table barberflow_private.receipt_payments drop constraint receipt_payments_method_check,
  add constraint receipt_payments_method_check check (method in ('pix','cash','card','debit','credit','transfer','other'));

create function public.barberflow_collect_order(shop uuid, appointment uuid, payment_method text, expected bigint, tendered bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare balance bigint;
begin
  if not exists(select 1 from public.barberflow_establishments where id=shop and owner_id=auth.uid())
    or public.barberflow_shop_access_state(shop)='blocked'
    or payment_method is null or payment_method not in ('pix','cash','debit','credit')
    or expected is null or expected<=0
    or (payment_method='cash' and coalesce(tendered,0)<expected) then return false; end if;
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  perform 1 from public.barberflow_schedule where establishment_id=shop and id=appointment for update;
  if not found then return false; end if;
  if payment_method='pix' and not exists(select 1 from public.barberflow_showcase_pix where establishment_id=shop) then return false; end if;
  perform public.barberflow_close_order(shop,appointment);
  select total_cents into balance from public.barberflow_receipts where establishment_id=shop and appointment_id=appointment for update;
  if exists(select 1 from barberflow_private.card_charges where receipt_id=appointment and status='open') then return false; end if;
  balance := balance-coalesce((select sum(amount_cents) from barberflow_private.receipt_payments where appointment_id=appointment and reversed_at is null),0);
  if balance is distinct from expected then raise exception 'O saldo da comanda mudou'; end if;
  insert into barberflow_private.receipt_payments(id,appointment_id,amount_cents,method,recorded_by)
    values(gen_random_uuid(),appointment,balance,payment_method,auth.uid());
  return true;
end;
$$;
revoke all on function public.barberflow_collect_order(uuid,uuid,text,bigint,bigint) from public,anon;
grant execute on function public.barberflow_collect_order(uuid,uuid,text,bigint,bigint) to authenticated;

create function public.barberflow_today_order_receipts(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'pix',coalesce(sum(p.amount_cents) filter(where p.method='cash'),0),
    'debit',coalesce(sum(p.amount_cents) filter(where p.method='debit'),0),
    'credit',coalesce(sum(p.amount_cents) filter(where p.method='credit'),0))
  from public.barberflow_receipts r join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
  where r.establishment_id=shop and p.reversed_at is null
    and (p.recorded_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date
    and exists(select 1 from public.barberflow_establishments where id=shop and owner_id=auth.uid());
$$;
revoke all on function public.barberflow_today_order_receipts(uuid) from public,anon;
grant execute on function public.barberflow_today_order_receipts(uuid) to authenticated;
create or replace function public.barberflow_order_payments(shop uuid, appointment uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'received_cents',coalesce(sum(p.amount_cents) filter(where p.reversed_at is null),0),
    'payments',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount_cents',p.amount_cents,'method',p.method,
      'recorded_at',p.recorded_at,'reversed_at',p.reversed_at,'reversal_reason',p.reversal_reason)
      order by p.recorded_at desc,p.id) filter(where p.id is not null),'[]'::jsonb)
  )
  from public.barberflow_receipts r
  left join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
  where r.establishment_id=shop and r.appointment_id=appointment and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid())
  group by r.appointment_id;
$$;

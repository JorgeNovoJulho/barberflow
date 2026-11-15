create function public.barberflow_collect_order_split(shop uuid, appointment uuid, expected bigint,
  first_method text, first_amount bigint, second_method text, cash_received bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  balance bigint;
  second_amount bigint := expected-first_amount;
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  if public.barberflow_shop_access_state(shop)='blocked'
    or first_method is null or first_method not in ('pix','cash','debit','credit')
    or second_method is null or second_method not in ('pix','cash','debit','credit')
    or first_method=second_method or expected is null or first_amount is null
    or first_amount<=0 or second_amount<=0 then return false; end if;
  if (first_method='cash' and coalesce(cash_received,0)<first_amount)
    or (second_method='cash' and coalesce(cash_received,0)<second_amount) then return false; end if;
  if 'pix' in (first_method,second_method) and not exists(
    select 1 from public.barberflow_showcase_pix where establishment_id=shop
  ) then return false; end if;
  perform 1 from public.barberflow_schedule where establishment_id=shop and id=appointment for update;
  if not found then return false; end if;
  if exists(select 1 from barberflow_private.card_charges where receipt_id=appointment and status='open')
    then return false; end if;
  balance := public.barberflow_close_order(shop,appointment);
  perform 1 from public.barberflow_receipts where establishment_id=shop and appointment_id=appointment for update;
  balance := balance-coalesce((select sum(amount_cents) from barberflow_private.receipt_payments
    where appointment_id=appointment and reversed_at is null),0);
  if balance is distinct from expected then raise exception 'O saldo da comanda mudou'; end if;
  insert into barberflow_private.receipt_payments(id,appointment_id,amount_cents,method,recorded_by)
    values (gen_random_uuid(),appointment,first_amount,first_method,auth.uid()),
           (gen_random_uuid(),appointment,second_amount,second_method,auth.uid());
  return true;
end;
$$;
revoke all on function public.barberflow_collect_order_split(uuid,uuid,bigint,text,bigint,text,bigint) from public,anon;
grant execute on function public.barberflow_collect_order_split(uuid,uuid,bigint,text,bigint,text,bigint) to authenticated;

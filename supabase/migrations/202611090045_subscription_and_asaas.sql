alter table barberflow_private.card_accounts alter column collector_id drop not null;
alter table barberflow_private.card_charges alter column collector_id drop not null;

alter table public.barberflow_plan_settings
  add column pix_beneficiary text not null default '' check(char_length(pix_beneficiary)<=120),
  add column support_whatsapp text not null default '' check(support_whatsapp ~ '^([1-9][0-9]{9,14})?$');
grant update(pix_beneficiary,support_whatsapp) on public.barberflow_plan_settings to authenticated;

-- Existing establishments without any trial or paid period receive the currently configured trial.
insert into public.barberflow_subscriptions(establishment_id,trial_until)
select e.id,(now() at time zone 'America/Sao_Paulo')::date+p.trial_days
from public.barberflow_establishments e cross join public.barberflow_plan_settings p
where p.trial_days>0 and not exists(select 1 from public.barberflow_subscription_payments x where x.establishment_id=e.id)
on conflict(establishment_id) do update set trial_until=excluded.trial_until
where barberflow_subscriptions.trial_until is null;

create function barberflow_private.subscription_bookable(shop uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(greatest(
    (select s.trial_until from public.barberflow_subscriptions s where s.establishment_id=shop),
    (select max(p.ends_before) from public.barberflow_subscription_payments p
      where p.establishment_id=shop and p.starts_on<=(now() at time zone 'America/Sao_Paulo')::date)
  )+3>(now() at time zone 'America/Sao_Paulo')::date,false);
$$;

create function barberflow_private.require_bookable_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.booked_by is not null and not barberflow_private.subscription_bookable(new.establishment_id) then
    raise exception using errcode='22023',message='Public booking paused',detail='subscription_paused';
  end if;
  return new;
end;
$$;
create trigger barberflow_require_bookable_subscription before insert on public.barberflow_schedule
for each row execute function barberflow_private.require_bookable_subscription();

create function public.barberflow_booking_enabled(profile_slug text) returns boolean
language sql stable security definer set search_path='' as $$
  select barberflow_private.subscription_bookable(e.id) from public.barberflow_establishments e
  where e.slug=profile_slug and e.published;
$$;

create or replace function public.barberflow_public_slots(profile_slug text, professional uuid, service uuid, booking_day date)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select * from barberflow_private.available_slots(profile_slug,professional,service,booking_day)
  where public.barberflow_booking_enabled(profile_slug);
$$;

revoke all on function barberflow_private.subscription_bookable(uuid),barberflow_private.require_bookable_subscription()
  from public,anon,authenticated;
revoke all on function public.barberflow_booking_enabled(text) from public;
grant execute on function public.barberflow_booking_enabled(text) to anon,authenticated;

create or replace function public.barberflow_card_status(shop uuid, receipt uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'account',(select jsonb_build_object('provider',case when a.sealed_token like 'asaas.%' then 'asaas' else 'mercado_pago' end,'sandbox',a.sandbox)
      from barberflow_private.card_accounts a where a.shop_id=shop),
    'charge',(select jsonb_build_object('id',c.id,'url',c.checkout_url,'expires',c.expires_at,'sandbox',c.sandbox,
      'status',c.status,'amount',c.amount,'provider',case when c.sealed_token like 'asaas.%' then 'asaas' else 'mercado_pago' end)
      from barberflow_private.card_charges c where c.shop_id=shop and c.receipt_id=receipt
      order by (c.status='open') desc,c.started_at desc,c.id desc limit 1))
  where barberflow_private.finance_unlocked(shop);
$$;

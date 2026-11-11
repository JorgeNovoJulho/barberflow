begin;
alter table public.barberflow_plan_settings
  add column premium_monthly_cents integer not null default 15990 check(premium_monthly_cents between 1 and 99999999),
  add column premium_yearly_cents integer not null default 159900 check(premium_yearly_cents between 1 and 99999999),
  alter column yearly_cents set default 59900;
update public.barberflow_plan_settings set monthly_cents=5990, yearly_cents=59900;
grant select(premium_monthly_cents,premium_yearly_cents) on public.barberflow_plan_settings to anon;
grant update(premium_monthly_cents,premium_yearly_cents) on public.barberflow_plan_settings to authenticated;
alter table public.barberflow_subscriptions
  add column preferred_plan text check(preferred_plan in ('pro','premium'));
alter table public.barberflow_subscription_charges
  add column plan text check(plan in ('pro','premium'));
alter table public.barberflow_subscription_payments
  add column plan text check(plan in ('pro','premium'));

drop index public.barberflow_subscription_open_charge;
create unique index barberflow_subscription_open_charge
  on public.barberflow_subscription_charges(establishment_id,period,coalesce(plan,'legacy'))
  where status in ('pending','submitted');

create function public.barberflow_confirm_subscription_payment(shop uuid, paid_period text, cents integer, payment_reference text, paid_plan text)
returns boolean language plpgsql security definer set search_path='' as $$
declare start_date date;
begin
  if (paid_plan is not null and paid_plan not in ('pro','premium')) or not public.barberflow_is_master() or paid_period is null or paid_period not in ('monthly','yearly')
    or cents is null or cents not between 1 and 99999999 or payment_reference is null
    or char_length(btrim(payment_reference)) not between 1 and 160 then return false; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop for update;
  if not found then return false; end if;
  select greatest((now() at time zone 'America/Sao_Paulo')::date,
    (select trial_until from public.barberflow_subscriptions where establishment_id=shop),
    (select max(ends_before) from public.barberflow_subscription_payments where establishment_id=shop)) into start_date;
  insert into public.barberflow_subscription_payments(establishment_id,period,amount_cents,reference,starts_on,ends_before,plan)
  values(shop,paid_period,cents,btrim(payment_reference),start_date,
    (start_date+case when paid_period='monthly' then interval '1 month' else interval '1 year' end)::date,paid_plan)
  on conflict(establishment_id,reference) do nothing;
  return found;
end;
$$;

create function public.barberflow_issue_subscription_pix(shop uuid, selected_period text, selected_plan text)
returns uuid language plpgsql security definer set search_path='' as $$
declare charge uuid;
begin
  if selected_plan is null or selected_plan not in ('pro','premium') or selected_period is null or selected_period not in ('monthly','yearly') then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  select c.id into charge from public.barberflow_subscription_charges c
    where c.establishment_id=shop and c.period=selected_period and c.plan=selected_plan and c.status in ('pending','submitted');
  if charge is null then
  insert into public.barberflow_subscription_charges(establishment_id,period,amount_cents,pix_key,merchant,city,plan)
    select shop,selected_period,case selected_plan when 'premium' then
      case selected_period when 'monthly' then premium_monthly_cents else premium_yearly_cents end
      else case selected_period when 'monthly' then monthly_cents else yearly_cents end end,
      pix_key,pix_merchant,pix_city,selected_plan
    from public.barberflow_plan_settings
    where pix_key ~ '^[!-~]{1,77}$' and pix_merchant ~ '^[A-Z0-9 .-]{1,25}$' and pix_city ~ '^[A-Z0-9 .-]{1,15}$'
    returning id into charge;
  end if;
  if charge is not null then
    insert into public.barberflow_subscriptions(establishment_id,preferred_period,preferred_plan)
      values(shop,selected_period,selected_plan)
    on conflict(establishment_id) do update
      set preferred_period=excluded.preferred_period,preferred_plan=excluded.preferred_plan;
  end if;
  return charge;
end;
$$;

create or replace function public.barberflow_review_subscription_pix(charge uuid, received_cents integer, reference text, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare request public.barberflow_subscription_charges%rowtype;
begin
  if not public.barberflow_is_master() then return false; end if;
  select * into request from public.barberflow_subscription_charges c where c.id=charge for update;
  if not found or request.status<>'submitted' then return false; end if;
  if reason is not null then
    if char_length(btrim(reason)) not between 1 and 500 then return false; end if;
    update public.barberflow_subscription_charges set status='rejected',rejection_reason=btrim(reason) where id=charge;
    return true;
  end if;
  if received_cents is distinct from request.amount_cents or reference is null
    or char_length(btrim(reference)) not between 1 and 160 then return false; end if;
  if not public.barberflow_confirm_subscription_payment(request.establishment_id,request.period,received_cents,btrim(reference),request.plan)
    then return false; end if;
  update public.barberflow_subscription_charges set status='confirmed',bank_reference=btrim(reference),payment_id=(
    select p.id from public.barberflow_subscription_payments p
      where p.establishment_id=request.establishment_id and p.reference=btrim(barberflow_review_subscription_pix.reference)
  ) where id=charge;
  return true;
end;
$$;

create or replace function public.barberflow_issue_subscription_pix(shop uuid, selected_period text)
returns uuid language sql security definer set search_path='' as $$
  select public.barberflow_issue_subscription_pix(shop,selected_period,'pro');
$$;

create or replace function public.barberflow_confirm_subscription_payment(shop uuid, paid_period text, cents integer, payment_reference text)
returns boolean language sql security definer set search_path='' as $$
  select public.barberflow_confirm_subscription_payment(shop,paid_period,cents,payment_reference,'pro');
$$;

revoke all on function public.barberflow_issue_subscription_pix(uuid,text,text),
  public.barberflow_confirm_subscription_payment(uuid,text,integer,text,text) from public,anon;
grant execute on function public.barberflow_issue_subscription_pix(uuid,text,text),
  public.barberflow_confirm_subscription_payment(uuid,text,integer,text,text) to authenticated;

-- Retain the existing paid period and its terms. A new tier takes effect on its confirmed start date.
create function barberflow_private.subscription_tier(shop uuid) returns text
language sql stable security definer set search_path='' as $$
  select p.plan from public.barberflow_subscription_payments p
  where p.establishment_id=shop and p.starts_on <= (now() at time zone 'America/Sao_Paulo')::date
  order by p.starts_on desc limit 1;
$$;

create index barberflow_subscription_tier_lookup
  on public.barberflow_subscription_payments(establishment_id,starts_on desc);

create function barberflow_private.appointment_count(shop uuid, booking_day date) returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from public.barberflow_schedule s
  where s.establishment_id=shop and s.kind='appointment' and s.state<>'cancelled'
    and s.starts_at>=booking_day::timestamp and s.starts_at<(booking_day+1)::timestamp;
$$;

create function barberflow_private.enforce_tier_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare tier text; quota integer; used bigint; exceeded text;
begin
  -- Only operations that add to a quota need the lock. Reductions always remain possible.
  if tg_table_name='barberflow_professionals' then
    if not new.active then return new; end if;
    if tg_op='UPDATE' and old.active and old.establishment_id=new.establishment_id then return new; end if;
  elsif tg_table_name='barberflow_products' then
    if not (new.showcase and new.active and new.deleted_at is null) then return new; end if;
    if tg_op='UPDATE' and old.showcase and old.active and old.deleted_at is null
      and old.establishment_id=new.establishment_id then return new; end if;
  elsif tg_table_name='barberflow_schedule' then
    if new.kind<>'appointment' or new.state='cancelled' then return new; end if;
    if tg_op='UPDATE' and old.kind='appointment' and old.state<>'cancelled'
      and old.starts_at::date=new.starts_at::date and old.establishment_id=new.establishment_id then return new; end if;
  elsif tg_op='UPDATE' and old.professional_id=new.professional_id and old.establishment_id=new.establishment_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.establishment_id::text, 1985));
  tier := barberflow_private.subscription_tier(new.establishment_id);
  if tier is null then return new; end if;

  case tg_table_name
    when 'barberflow_products' then
      quota := case when tier='pro' then 20 else 100 end;
      select count(*) into used from public.barberflow_products p
        where p.establishment_id=new.establishment_id and p.showcase and p.active and p.deleted_at is null;
      exceeded := 'Limite de produtos ativos na vitrine do plano atingido.';
    when 'barberflow_professionals' then
      if tier<>'pro' then return new; end if;
      quota := 2;
      select count(*) into used from public.barberflow_professionals p
        where p.establishment_id=new.establishment_id and p.active;
      exceeded := 'O plano Pro permite até 2 profissionais ativos.';
    when 'barberflow_professional_services' then
      if tier<>'pro' then return new; end if;
      if tg_op='INSERT' and exists (select 1 from public.barberflow_professional_services p
        where p.establishment_id=new.establishment_id and p.professional_id=new.professional_id
          and p.service_id=new.service_id) then return new; end if;
      quota := 2;
      select count(*) into used from public.barberflow_professional_services p
        where p.establishment_id=new.establishment_id and p.professional_id=new.professional_id;
      exceeded := 'O plano Pro permite até 2 serviços vinculados por profissional.';
    when 'barberflow_schedule' then
      if tier<>'pro' then return new; end if;
      quota := 8;
      used := barberflow_private.appointment_count(new.establishment_id,new.starts_at::date);
      exceeded := 'O plano Pro permite até 8 agendamentos por dia.';
  end case;
  if used>=quota then raise exception using errcode='BF001', message=exceeded; end if;
  return new;
end;
$$;

create trigger barberflow_quota_professionals before insert or update on public.barberflow_professionals
  for each row execute function barberflow_private.enforce_tier_quota();
create trigger barberflow_quota_services before insert or update on public.barberflow_professional_services
  for each row execute function barberflow_private.enforce_tier_quota();
create trigger barberflow_quota_schedule before insert or update on public.barberflow_schedule
  for each row execute function barberflow_private.enforce_tier_quota();
create trigger barberflow_quota_showcase before insert or update on public.barberflow_products
  for each row execute function barberflow_private.enforce_tier_quota();

create or replace function public.barberflow_public_slots(profile_slug text, professional uuid, service uuid, booking_day date)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select slots.slot
  from public.barberflow_establishments e
  cross join lateral barberflow_private.available_slots(profile_slug,professional,service,booking_day) slots
  where e.slug=profile_slug and public.barberflow_booking_enabled(profile_slug)
    and (barberflow_private.subscription_tier(e.id) is distinct from 'pro'
      or barberflow_private.appointment_count(e.id,booking_day)<8);
$$;

revoke all on function barberflow_private.subscription_tier(uuid),
  barberflow_private.appointment_count(uuid,date),barberflow_private.enforce_tier_quota()
  from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

begin;
alter table public.barberflow_plan_settings
  add column unlimited_monthly_cents integer not null default 25990 check(unlimited_monthly_cents between 1 and 99999999),
  add column unlimited_yearly_cents integer not null default 259900 check(unlimited_yearly_cents between 1 and 99999999);
update public.barberflow_plan_settings set monthly_cents=5990,yearly_cents=59900,premium_monthly_cents=15990,
  premium_yearly_cents=159900,trial_days=7;
alter table public.barberflow_plan_settings alter column trial_days set default 7;
grant select(unlimited_monthly_cents,unlimited_yearly_cents) on public.barberflow_plan_settings to anon;
grant update(unlimited_monthly_cents,unlimited_yearly_cents) on public.barberflow_plan_settings to authenticated;
alter table public.barberflow_subscriptions drop constraint barberflow_subscriptions_preferred_plan_check,
  add constraint barberflow_subscriptions_preferred_plan_check check (preferred_plan in ('pro','premium','unlimited'));
alter table public.barberflow_subscription_charges drop constraint barberflow_subscription_charges_plan_check,
  add constraint barberflow_subscription_charges_plan_check check (plan in ('pro','premium','unlimited'));
alter table public.barberflow_subscription_payments drop constraint barberflow_subscription_payments_plan_check,
  add constraint barberflow_subscription_payments_plan_check check (plan in ('pro','premium','unlimited'));

create function barberflow_private.plan_rank(plan text) returns integer language sql immutable set search_path='' as $$
  select case plan when 'pro' then 1 when 'premium' then 2 when 'unlimited' then 3 else 0 end;
$$;
revoke all on function barberflow_private.plan_rank(text) from public,anon,authenticated;

create function barberflow_private.plan_limits(plan text) returns jsonb language sql immutable set search_path='' as $$
  select case plan
    when 'unlimited' then jsonb_build_object('professionals',null,'services',null,'appointments',null,'products',200)
    when 'premium' then jsonb_build_object('professionals',5,'services',5,'appointments',20,'products',40)
    else jsonb_build_object('professionals',2,'services',2,'appointments',8,'products',15) end;
$$;
revoke all on function barberflow_private.plan_limits(text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION barberflow_private.subscription_status(shop uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with clock as (
    select (now() at time zone 'America/Sao_Paulo')::date as today
  ), status as (
    select t.today, c.status as admin_status, c.bonus_until, s.trial_until,
      terms.denied, terms.active_free, terms.half_price, p.plan, p.ends_before as paid_until, cfg.grace_days
    from public.barberflow_establishments e
    left join lateral barberflow_private.promoter_terms(e.owner_id) terms on true
    cross join clock t
    cross join public.barberflow_plan_settings cfg
    left join barberflow_private.subscription_controls c on c.shop_id=e.id
    left join public.barberflow_subscriptions s on s.establishment_id=e.id
    left join lateral (
      select payment.plan,payment.ends_before
      from public.barberflow_subscription_payments payment
      where payment.establishment_id=e.id and payment.starts_on<=t.today
      order by (payment.ends_before > t.today) desc, payment.starts_on desc,payment.confirmed_at desc,payment.id desc limit 1
    ) p on true
    where e.id=shop
  ), deadlines as (
    select *, greatest(paid_until,trial_until,bonus_until) as valid_until,
      greatest(greatest(paid_until,trial_until)+grace_days,bonus_until) as access_until
    from status
  )
  select jsonb_build_object(
    'promoter', denied is not null, 'promoter_free', active_free, 'promoter_half', half_price,
    'state', case when denied then 'blocked' when admin_status in ('blocked','frozen') then admin_status when active_free then 'normal'
      when coalesce(access_until<=today,true) then 'expired' else 'normal' end,
    'plan', case when active_free then 'premium' when paid_until>today then coalesce(plan,'legacy')
      when trial_until>today then 'free'
      when bonus_until>today then 'bonus'
      when paid_until is not null then coalesce(plan,'legacy')
      when trial_until is not null then 'free' end,
    'ends_before', case when paid_until>today then paid_until
      when trial_until>today then trial_until
      when bonus_until>today then bonus_until else valid_until end,
    'days_left', valid_until-today
  ) from deadlines;
$function$
;
create or replace function barberflow_private.subscription_tier(shop uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when value->>'plan' in ('pro','premium','unlimited') then value->>'plan' else 'pro' end
  from (select barberflow_private.subscription_status(shop) as value) s;
$$;
CREATE OR REPLACE FUNCTION barberflow_private.enforce_tier_quota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      quota := (barberflow_private.plan_limits(tier)->>'products')::integer;
      select count(*) into used from public.barberflow_products p
        where p.establishment_id=new.establishment_id and p.showcase and p.active and p.deleted_at is null;
      exceeded := 'Limite de produtos ativos na vitrine do plano atingido.';
    when 'barberflow_professionals' then
      quota := (barberflow_private.plan_limits(tier)->>'professionals')::integer;
      if quota is null then return new; end if;
      select count(*) into used from public.barberflow_professionals p
        where p.establishment_id=new.establishment_id and p.active;
      exceeded := 'O plano Pro permite até 2 profissionais ativos.';
    when 'barberflow_professional_services' then
      if (barberflow_private.plan_limits(tier)->>'services') is null then return new; end if;
      if tg_op='INSERT' and exists (select 1 from public.barberflow_professional_services p
        where p.establishment_id=new.establishment_id and p.professional_id=new.professional_id
          and p.service_id=new.service_id) then return new; end if;
      quota := (barberflow_private.plan_limits(tier)->>'services')::integer;
      select count(*) into used from public.barberflow_professional_services p
        where p.establishment_id=new.establishment_id and p.professional_id=new.professional_id;
      exceeded := 'O plano Pro permite até 2 serviços vinculados por profissional.';
    when 'barberflow_schedule' then
      quota := (barberflow_private.plan_limits(tier)->>'appointments')::integer;
      if quota is null then return new; end if;
      used := barberflow_private.appointment_count(new.establishment_id,new.starts_at::date);
      exceeded := 'O plano Pro permite até 8 agendamentos por dia.';
  end case;
  if used>=quota then raise exception using errcode='BF001',
    message='Limite do plano atingido. Consulte as opções de upgrade.',
    detail=jsonb_build_object('plan',tier,'limit',quota,'table',tg_table_name)::text; end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_public_slots(profile_slug text, professional uuid, service uuid, booking_day date)
 RETURNS TABLE(slot timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select slots.slot
  from public.barberflow_establishments e
  cross join lateral barberflow_private.available_slots(profile_slug,professional,service,booking_day) slots
  where e.slug=profile_slug and public.barberflow_booking_enabled(profile_slug)
    and ((barberflow_private.plan_limits(barberflow_private.subscription_tier(e.id))->>'appointments') is null
      or barberflow_private.appointment_count(e.id,booking_day)<(barberflow_private.plan_limits(barberflow_private.subscription_tier(e.id))->>'appointments')::integer);
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_issue_subscription_pix(shop uuid, selected_period text, selected_plan text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare charge uuid; terms record; expected integer;
begin
  if selected_plan is null or selected_plan not in ('pro','premium','unlimited') or selected_period is null or selected_period not in ('monthly','yearly') then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  select * into terms from barberflow_private.promoter_terms(auth.uid());
  if found and (terms.denied or terms.active_free or selected_period <> 'monthly' or selected_plan <> 'premium') then return null; end if;
  if terms.half_price is not null then
    select case when terms.half_price then (premium_monthly_cents+1)/2 else premium_monthly_cents end
      into expected from public.barberflow_plan_settings;
    update public.barberflow_subscription_charges set status='rejected', rejection_reason='Valor atualizado. Gere uma nova cobrança.'
      where establishment_id=shop and status='pending' and amount_cents<>expected;
  end if;
  select c.id into charge from public.barberflow_subscription_charges c
    where c.establishment_id=shop and c.period=selected_period and c.plan=selected_plan and c.status in ('pending','submitted');
  if charge is null then
  insert into public.barberflow_subscription_charges(establishment_id,period,amount_cents,pix_key,merchant,city,plan)
    select shop,selected_period,case selected_plan when 'unlimited' then case selected_period when 'monthly' then unlimited_monthly_cents else unlimited_yearly_cents end when 'premium' then
      case selected_period when 'monthly' then case when terms.half_price then (premium_monthly_cents+1)/2 else premium_monthly_cents end else premium_yearly_cents end
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
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_confirm_subscription_payment(shop uuid, paid_period text, cents integer, payment_reference text, paid_plan text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare start_date date; current_rank integer;
begin
  if (paid_plan is not null and paid_plan not in ('pro','premium','unlimited')) or not public.barberflow_is_master() or paid_period is null or paid_period not in ('monthly','yearly')
    or cents is null or cents not between 1 and 99999999 or payment_reference is null
    or char_length(btrim(payment_reference)) not between 1 and 160 then return false; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop for update;
  if not found then return false; end if;
  select barberflow_private.plan_rank(barberflow_private.subscription_tier(shop)) into current_rank;
  if barberflow_private.plan_rank(paid_plan)>current_rank then
    start_date := (now() at time zone 'America/Sao_Paulo')::date;
  else
  select greatest((now() at time zone 'America/Sao_Paulo')::date,
    (select trial_until from public.barberflow_subscriptions where establishment_id=shop),
    (select max(ends_before) from public.barberflow_subscription_payments where establishment_id=shop)) into start_date;
  end if;
  insert into public.barberflow_subscription_payments(establishment_id,period,amount_cents,reference,starts_on,ends_before,plan)
  values(shop,paid_period,cents,btrim(payment_reference),start_date,
    (start_date+case when paid_period='monthly' then interval '1 month' else interval '1 year' end)::date,paid_plan)
  on conflict(establishment_id,reference) do nothing;
  return found;
end;
$function$
;

create function public.barberflow_plan_limit_status(shop uuid, person uuid default null, booking_day date default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'plan',barberflow_private.subscription_tier(shop),
    'limits',barberflow_private.plan_limits(barberflow_private.subscription_tier(shop)),
    'professional_count',(select count(*) from public.barberflow_professionals p where p.establishment_id=shop and p.active),
    'product_count',(select count(*) from public.barberflow_products p where p.establishment_id=shop and p.active and p.showcase and p.deleted_at is null),
    'service_count',(select count(*) from public.barberflow_professional_services ps where ps.establishment_id=shop and ps.professional_id=person),
    'appointment_count',barberflow_private.appointment_count(shop,coalesce(booking_day,(now() at time zone 'America/Sao_Paulo')::date)),
    'promoter',exists(select 1 from public.barberflow_establishments e cross join lateral barberflow_private.promoter_terms(e.owner_id) t where e.id=shop and t.denied is not null),
    'owner',exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid())
  )
  where exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid())
    or exists(select 1 from barberflow_private.team_access t where t.establishment_id=shop and t.user_id=auth.uid() and t.accepted_at is not null and t.revoked_at is null);
$$;
revoke all on function public.barberflow_plan_limit_status(uuid,uuid,date) from public,anon;
grant execute on function public.barberflow_plan_limit_status(uuid,uuid,date) to authenticated;
create or replace function public.barberflow_promoter_request(send_request boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  applicant uuid := auth.uid();
  eligible boolean;
  request barberflow_private.promoter_requests;
begin
  if applicant is null then return null; end if;
  if exists (select 1 from barberflow_private.promoters where user_id=applicant and deleted_at is null) then
    return jsonb_build_object('status','active');
  end if;
  eligible := exists (
    select 1 from public.barberflow_subscription_payments p
    join public.barberflow_establishments e on e.id=p.establishment_id
    where e.owner_id=applicant and p.plan in ('pro','premium','unlimited')
  );
  if send_request and eligible then
    insert into barberflow_private.promoter_requests as r(user_id) values(applicant)
    on conflict (user_id) do update set status='pending', requested_at=now(), reason=null
      where r.status='denied';
  end if;
  select * into request from barberflow_private.promoter_requests where user_id=applicant;
  return jsonb_build_object('eligible',eligible,'status',request.status,'reason',request.reason);
end;
$$;


notify pgrst, 'reload schema';
commit;

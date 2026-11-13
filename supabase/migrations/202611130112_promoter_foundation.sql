begin;

create table barberflow_private.promoter_invites (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null,
  expires_at timestamptz not null default now() + interval '48 hours',
  redeemed_at timestamptz
);

create table barberflow_private.promoters (
  user_id uuid primary key,
  referral_code text unique check (referral_code ~ '^[A-Z0-9]{12}$'),
  first_access_at timestamptz,
  discount_suspended boolean not null default false,
  exempt_until date,
  blocked_at timestamptz,
  deleted_at timestamptz
);

revoke all on barberflow_private.promoter_invites, barberflow_private.promoters from public, anon, authenticated;

create function public.barberflow_create_promoter_invite(digest_hex text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.barberflow_is_master() or auth.uid() is null then
    return false;
  end if;
  insert into barberflow_private.promoter_invites(token_hash, created_by)
    values (digest_hex, auth.uid())
    on conflict do nothing;
  return found;
end;
$$;

revoke all on function public.barberflow_create_promoter_invite(text) from public, anon;
grant execute on function public.barberflow_create_promoter_invite(text) to authenticated;

create function public.barberflow_promoter_invite_valid(digest_hex text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from barberflow_private.promoter_invites
    where token_hash=digest_hex and redeemed_at is null and expires_at>now());
$$;
revoke all on function public.barberflow_promoter_invite_valid(text) from public,anon,authenticated;
grant execute on function public.barberflow_promoter_invite_valid(text) to service_role;

create function barberflow_private.redeem_promoter_invite()
returns trigger language plpgsql security definer set search_path='' as $$
declare digest_hex text := new.raw_app_meta_data->>'barberflow_promoter_invite';
begin
  if digest_hex is null then return new; end if;
  update barberflow_private.promoter_invites set redeemed_at=now()
    where token_hash=digest_hex and redeemed_at is null and expires_at>now();
  if not found then raise exception 'Convite inválido ou expirado'; end if;
  insert into barberflow_private.promoters(user_id) values(new.id);
  return new;
end;
$$;
create trigger barberflow_redeem_promoter_invite after insert on auth.users
for each row execute function barberflow_private.redeem_promoter_invite();

create function public.barberflow_promoter_access()
returns timestamptz language sql volatile security definer set search_path='' as $$
  update barberflow_private.promoters set first_access_at=coalesce(first_access_at,now())
  where user_id=auth.uid() and blocked_at is null and deleted_at is null
  returning first_access_at;
$$;
revoke all on function public.barberflow_promoter_access() from public,anon;
grant execute on function public.barberflow_promoter_access() to authenticated;

alter table barberflow_private.promoters add column pix_key text;

create function public.barberflow_promoter_profile(new_code text default null, new_pix text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile barberflow_private.promoters;
begin
  select * into profile from barberflow_private.promoters
    where user_id=auth.uid() and blocked_at is null and deleted_at is null for update;
  if not found then return null; end if;
  if new_code is not null and profile.referral_code is not null then
    raise insufficient_privilege using message='O código de indicação é permanente.';
  end if;
  if new_pix is not null and new_pix !~ '^(\d{11}|\d{14}|\+[1-9]\d{9,14}|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}|[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$' then
    raise invalid_parameter_value using message='Chave Pix inválida.';
  end if;
  if new_code is not null or new_pix is not null then
    update barberflow_private.promoters set referral_code=coalesce(new_code,referral_code), pix_key=coalesce(lower(new_pix),pix_key)
    where user_id=auth.uid() returning * into profile;
  end if;
  return jsonb_build_object('code',profile.referral_code,'pix',profile.pix_key,'trial_until',profile.first_access_at+interval '90 days',
    'referrals',(select count(*) from barberflow_private.promoter_referrals where promoter=profile.user_id),
    'paid',(select count(*) from barberflow_private.promoter_referrals r join barberflow_private.promoter_commissions c using(referred_user) where r.promoter=profile.user_id),
    'commissions',(select coalesce(jsonb_agg(jsonb_build_object('amount',c.amount_cents,'date',c.earned_at,'paid',c.paid_at is not null) order by c.earned_at desc),'[]')
      from (select c.* from barberflow_private.promoter_commissions c join barberflow_private.promoter_referrals r using(referred_user)
        where r.promoter=profile.user_id and c.amount_cents>0 order by c.earned_at desc limit 50) c));
end;
$$;
revoke all on function public.barberflow_promoter_profile(text,text) from public,anon;
grant execute on function public.barberflow_promoter_profile(text,text) to authenticated;

create table barberflow_private.promoter_referrals (
  referred_user uuid primary key,
  promoter uuid not null references barberflow_private.promoters(user_id),
  created_at timestamptz not null default now(),
  check (referred_user <> promoter)
);
create table barberflow_private.promoter_commissions (
  referred_user uuid primary key references barberflow_private.promoter_referrals(referred_user),
  amount_cents integer not null check (amount_cents >= 0),
  earned_at timestamptz not null default now(),
  paid_at timestamptz
);
create table barberflow_private.promoter_settings (
  singleton boolean primary key default true check(singleton),
  commission_cents integer not null check(commission_cents between 0 and 99999999)
);
insert into barberflow_private.promoter_settings values(true,0);
revoke all on barberflow_private.promoter_referrals,barberflow_private.promoter_commissions,barberflow_private.promoter_settings from public,anon,authenticated;

create function barberflow_private.capture_promoter_referral()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.raw_app_meta_data->>'barberflow_promoter' = 'true' then return new; end if;
  insert into barberflow_private.promoter_referrals(referred_user,promoter)
  select new.id,p.user_id from barberflow_private.promoters p join auth.users u on u.id=p.user_id
  where p.referral_code=new.raw_user_meta_data->>'referral_code'
    and p.blocked_at is null and p.deleted_at is null
    and lower(u.email) is distinct from lower(new.email)
    and (nullif(new.phone,'') is null or u.phone is distinct from new.phone)
    and lower(p.pix_key) is distinct from lower(new.email);
  return new;
end;
$$;
create trigger barberflow_capture_promoter_referral after insert on auth.users
for each row execute function barberflow_private.capture_promoter_referral();

create function barberflow_private.credit_promoter_commission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.period <> 'monthly' then return new; end if;
  insert into barberflow_private.promoter_commissions(referred_user,amount_cents)
  select r.referred_user,s.commission_cents
  from public.barberflow_establishments e
  join barberflow_private.promoter_referrals r on r.referred_user=e.owner_id
  join barberflow_private.promoters p on p.user_id=r.promoter
  cross join barberflow_private.promoter_settings s
  where e.id=new.establishment_id and not exists (select 1 from public.barberflow_showcase_pix px where px.establishment_id=e.id and lower(px.pix_key)=p.pix_key) and p.deleted_at is null and p.blocked_at is null
  on conflict(referred_user) do nothing;
  return new;
end;
$$;
create trigger barberflow_credit_promoter_commission after insert on public.barberflow_subscription_payments
for each row execute function barberflow_private.credit_promoter_commission();

create function public.barberflow_promoter_commission_settings(cents integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_is_master() or cents is null or cents not between 0 and 99999999 then return false; end if;
  update barberflow_private.promoter_settings set commission_cents=cents where singleton;
  return found;
end;
$$;
revoke all on function public.barberflow_promoter_commission_settings(integer) from public,anon;
grant execute on function public.barberflow_promoter_commission_settings(integer) to authenticated;


create function barberflow_private.promoter_terms(member uuid)
returns table(active_free boolean, half_price boolean, denied boolean)
language sql stable security definer set search_path='' as $$
  select coalesce(now()<p.first_access_at+interval '90 days',true) or coalesce(p.exempt_until >= (now() at time zone 'America/Sao_Paulo')::date,false),
    not p.discount_suspended and (
      cycles.number<2
      or exists (
        select 1 from barberflow_private.promoter_commissions c
        join barberflow_private.promoter_referrals r using(referred_user)
        where r.promoter=p.user_id and c.earned_at>=cycle.start_at+(cycles.number-2)*interval '1 month'
          and c.earned_at<cycle.start_at+cycles.number*interval '1 month'
      )
    ), p.blocked_at is not null or p.deleted_at is not null
  from barberflow_private.promoters p
  cross join lateral (select p.first_access_at+interval '90 days' as start_at) cycle
  cross join lateral (
    select greatest(0,(extract(year from now() at time zone 'America/Sao_Paulo')-extract(year from cycle.start_at at time zone 'America/Sao_Paulo'))::integer*12
      +(extract(month from now() at time zone 'America/Sao_Paulo')-extract(month from cycle.start_at at time zone 'America/Sao_Paulo'))::integer) as months
  ) estimate
  cross join lateral (
    select estimate.months-case when now()<cycle.start_at+estimate.months*interval '1 month' then 1 else 0 end as number
  ) cycles
  where p.user_id=member;
$$;
revoke all on function barberflow_private.promoter_terms(uuid) from public,anon,authenticated;

create table barberflow_private.promoter_audit (
  id bigint generated always as identity primary key, actor uuid not null, target uuid not null,
  operation text not null, created_at timestamptz not null default now()
);
revoke all on barberflow_private.promoter_audit from public,anon,authenticated;

create function public.barberflow_manage_promoter(member uuid, operation text, until_date date default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_is_master() or operation not in ('suspend','restore','exempt','block','unblock','delete','paid') then return false; end if;
  if operation='paid' then
    update barberflow_private.promoter_commissions c set paid_at=now()
    from barberflow_private.promoter_referrals r
    where r.referred_user=c.referred_user and r.promoter=member and c.paid_at is null and c.amount_cents>0;
    if not found then return false; end if;
    insert into barberflow_private.promoter_audit(actor,target,operation) values(auth.uid(),member,operation);
    return true;
  end if;
  update barberflow_private.promoters set
    discount_suspended=case when operation='suspend' then true when operation='restore' then false else discount_suspended end,
    exempt_until=case when operation='exempt' then until_date else exempt_until end,
    blocked_at=case when operation in ('block','delete') then now() when operation='unblock' then null else blocked_at end,
    deleted_at=case when operation='delete' then now() else deleted_at end
  where user_id=member and deleted_at is null;
  if not found then return false; end if;
  if operation in ('block','delete','unblock') then
    update auth.users set banned_until=case when operation='unblock' then null else 'infinity'::timestamptz end where id=member;
    if operation<>'unblock' then delete from auth.sessions where user_id=member; end if;
  end if;
  insert into barberflow_private.promoter_audit(actor,target,operation) values(auth.uid(),member,operation);
  return true;
end;
$$;
revoke all on function public.barberflow_manage_promoter(uuid,text,date) from public,anon;
grant execute on function public.barberflow_manage_promoter(uuid,text,date) to authenticated;

create function public.barberflow_list_promoters()
returns table(id uuid,name text,email text,first_access timestamptz,pix text,benefit text,referrals bigint,commission bigint,pending bigint)
language sql stable security definer set search_path='' as $$
  select p.user_id,u.raw_user_meta_data->>'full_name',u.email::text,p.first_access_at,p.pix_key,
    case when t.denied then 'Bloqueado' when t.active_free then 'Isento' when t.half_price then '50%' else 'Integral' end,
    count(r.referred_user),coalesce(sum(c.amount_cents),0),coalesce(sum(c.amount_cents) filter(where c.paid_at is null),0)
  from barberflow_private.promoters p join auth.users u on u.id=p.user_id
  cross join lateral barberflow_private.promoter_terms(p.user_id) t
  left join barberflow_private.promoter_referrals r on r.promoter=p.user_id
  left join barberflow_private.promoter_commissions c on c.referred_user=r.referred_user
  where public.barberflow_is_master() and p.deleted_at is null
  group by p.user_id,u.email,u.raw_user_meta_data,t.denied,t.active_free,t.half_price
  order by p.first_access_at desc nulls last;
$$;
revoke all on function public.barberflow_list_promoters() from public,anon;
grant execute on function public.barberflow_list_promoters() to authenticated;
create or replace function public.barberflow_issue_subscription_pix(shop uuid, selected_period text, selected_plan text)
returns uuid language plpgsql security definer set search_path='' as $$
declare charge uuid; terms record; expected integer;
begin
  if selected_plan is null or selected_plan not in ('pro','premium') or selected_period is null or selected_period not in ('monthly','yearly') then return null; end if;
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
    select shop,selected_period,case selected_plan when 'premium' then
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
$$;
create or replace function barberflow_private.subscription_status(shop uuid) returns jsonb
language sql stable security definer set search_path='' as $$
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
      order by payment.starts_on desc limit 1
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
$$;

create function public.barberflow_initialize_google_referral(chosen_kind text, referral text)
returns text language plpgsql security definer set search_path='' as $$
declare member uuid := auth.uid();
begin
  if chosen_kind in ('cliente','barbearia') and exists(
    select 1 from auth.users where id=member and email_confirmed_at is not null
      and raw_app_meta_data->>'provider'='google' and created_at > now()-interval '10 minutes'
  ) then
    insert into barberflow_private.account_roles values(member,chosen_kind) on conflict do nothing;
    if found then
      insert into barberflow_private.promoter_referrals(referred_user,promoter)
      select member,p.user_id from barberflow_private.promoters p
      join auth.users inviter on inviter.id=p.user_id join auth.users invited on invited.id=member
      where p.referral_code=referral and p.user_id<>member and p.blocked_at is null and p.deleted_at is null
        and lower(inviter.email) is distinct from lower(invited.email)
        and (nullif(invited.phone,'') is null or inviter.phone is distinct from invited.phone)
        and lower(p.pix_key) is distinct from lower(invited.email)
      on conflict do nothing;
    end if;
  end if;
  return public.barberflow_initialize_google_account(chosen_kind);
end;
$$;
revoke all on function public.barberflow_initialize_google_referral(text,text) from public,anon;
grant execute on function public.barberflow_initialize_google_referral(text,text) to authenticated;

commit;

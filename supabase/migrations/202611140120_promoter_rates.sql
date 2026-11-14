alter table barberflow_private.promoter_settings add column rates jsonb;

create function public.barberflow_promoter_rates(new_rates jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_rates jsonb;
begin
  if not public.barberflow_is_master() then return null; end if;
  if new_rates is not null then
    if jsonb_typeof(new_rates) <> 'object' or exists (
      select 1 from unnest(array['pro_monthly','pro_yearly','premium_monthly','premium_yearly']) as keys(k)
      where not coalesce(new_rates->>k ~ '^[0-9]{1,3}(\.[0-9]{1,2})?$', false)
    ) then return null; end if;
    if exists (select 1 from jsonb_each_text(new_rates) where value::numeric > 100) then return null; end if;
    update barberflow_private.promoter_settings set rates=new_rates where singleton;
  end if;
  select rates into current_rates from barberflow_private.promoter_settings where singleton;
  return coalesce(current_rates,'{}'::jsonb);
end;
$$;
revoke all on function public.barberflow_promoter_rates(jsonb) from public,anon;
grant execute on function public.barberflow_promoter_rates(jsonb) to authenticated;

create or replace function barberflow_private.credit_promoter_commission()
returns trigger language plpgsql security definer set search_path='' as $$
begin

  insert into barberflow_private.promoter_commissions(referred_user,amount_cents)
  select r.referred_user,coalesce(round(new.amount_cents * (s.rates->>(coalesce(new.plan,'pro') || '_' || new.period))::numeric / 100)::integer, s.commission_cents)
  from public.barberflow_establishments e
  join barberflow_private.promoter_referrals r on r.referred_user=e.owner_id
  join barberflow_private.promoters p on p.user_id=r.promoter
  cross join barberflow_private.promoter_settings s
  where e.id=new.establishment_id and (s.rates is not null or new.period = 'monthly') and not exists (select 1 from public.barberflow_showcase_pix px where px.establishment_id=e.id and lower(px.pix_key)=p.pix_key) and p.deleted_at is null and p.blocked_at is null
  on conflict(referred_user) do nothing;
  return new;
end;
$$;

create function public.barberflow_promoter_referral_list(member uuid)
returns table(id uuid, name text, joined timestamptz, kind text, plan text, period text, validity date, avatar text)
language sql stable security definer set search_path='' as $$
  select u.id, coalesce(sp.username, u.raw_user_meta_data->>'full_name', u.email),
    u.created_at, ar.kind, subscription.plan, subscription.period, subscription.ends_before, sp.avatar
  from barberflow_private.promoter_referrals r
  join auth.users u on u.id=r.referred_user
  left join public.barberflow_social_profiles sp on sp.user_id=u.id
  left join barberflow_private.account_roles ar on ar.user_id=u.id
  left join lateral (
    select p.plan,p.period,p.ends_before
    from public.barberflow_subscription_payments p
    join public.barberflow_establishments e on e.id=p.establishment_id
    where e.owner_id=u.id
    order by p.ends_before desc,p.confirmed_at desc,p.id limit 1
  ) subscription on true
  where public.barberflow_is_master() and r.promoter=member
  order by u.created_at desc,u.id;
$$;
revoke all on function public.barberflow_promoter_referral_list(uuid) from public,anon;
grant execute on function public.barberflow_promoter_referral_list(uuid) to authenticated;

create function public.barberflow_promoter_card_profiles()
returns table(id uuid, avatar text, slug text, has_profile boolean)
language sql stable security definer set search_path='' as $$
  select p.user_id, sp.avatar, shop.slug, sp.user_id is not null
  from barberflow_private.promoters p
  left join public.barberflow_social_profiles sp on sp.user_id=p.user_id
  left join lateral (
    select e.slug from public.barberflow_establishments e
    where e.owner_id=p.user_id and e.published order by e.id limit 1
  ) shop on true
  where public.barberflow_is_master() and p.deleted_at is null;
$$;
revoke all on function public.barberflow_promoter_card_profiles() from public,anon;
grant execute on function public.barberflow_promoter_card_profiles() to authenticated;

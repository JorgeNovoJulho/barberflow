create table barberflow_private.account_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null
);

create function public.barberflow_touch_activity() returns void
language sql security definer set search_path='' as $$
  insert into barberflow_private.account_activity(user_id,seen_at)
  select auth.uid(),now() where auth.uid() is not null
  on conflict(user_id) do update set seen_at=excluded.seen_at
  where barberflow_private.account_activity.seen_at < now()-interval '45 seconds';
$$;

create function public.barberflow_master_users(search_text text, page_index integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with users as (
    select u.id,u.email,left(u.raw_user_meta_data->>'full_name',120) as name,
      u.raw_user_meta_data->>'account_intent' as intent,u.created_at,u.email_confirmed_at,u.last_sign_in_at,u.banned_until,
      a.seen_at,coalesce(a.seen_at>now()-interval '3 minutes',false) as online,
      (select count(*) from public.barberflow_establishments e where e.owner_id=u.id) as businesses
    from auth.users u left join barberflow_private.account_activity a on a.user_id=u.id
    where public.barberflow_is_master()
  ), filtered as (
    select * from users where strpos(lower(concat(email,' ',name)),lower(left(coalesce(search_text,''),120)))>0
      or coalesce(search_text,'')=''
  )
  select jsonb_build_object(
    'total',(select count(*) from users),
    'confirmed',(select count(email_confirmed_at) from users),
    'online',(select count(*) from users where online),
    'filtered',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
      select * from filtered order by created_at desc,id limit 25 offset greatest(0,least(page_index,100000))*25
    ) r),'[]'::jsonb)
  ) where public.barberflow_is_master();
$$;

create function public.barberflow_master_recovery_email(target_user uuid) returns text
language sql stable security definer set search_path='' as $$
  select u.email from auth.users u where u.id=target_user and u.email_confirmed_at is not null
    and public.barberflow_is_master();
$$;

create table barberflow_private.subscription_controls (
  shop_id uuid primary key references public.barberflow_establishments(id),
  status text not null default 'normal' check(status in ('normal','frozen','blocked')),
  bonus_until date
);
create table barberflow_private.subscription_control_history (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.barberflow_establishments(id),
  actor_id uuid references auth.users(id) on delete set null,
  operation text not null,
  reason text not null,
  bonus_until date,
  created_at timestamptz not null default now()
);

create function public.barberflow_master_subscription_control(shop uuid, operation text, days integer, reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'America/Sao_Paulo')::date; expiration date;
begin
  if not public.barberflow_is_master() or operation is null or operation not in ('normal','frozen','blocked','bonus')
    or coalesce(char_length(btrim(reason)),0) not between 3 and 400
    or (operation='bonus' and coalesce(days,0) not between 1 and 365) then return false; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop for update;
  if not found then return false; end if;
  if operation='bonus' then
    select greatest(today,(select c.bonus_until from barberflow_private.subscription_controls c where c.shop_id=shop),
      (select s.trial_until from public.barberflow_subscriptions s where s.establishment_id=shop),
      (select max(p.ends_before) from public.barberflow_subscription_payments p where p.establishment_id=shop))+days into expiration;
    insert into barberflow_private.subscription_controls(shop_id,bonus_until) values(shop,expiration)
    on conflict(shop_id) do update set bonus_until=excluded.bonus_until;
  else
    insert into barberflow_private.subscription_controls(shop_id,status) values(shop,operation)
    on conflict(shop_id) do update set status=excluded.status
    returning bonus_until into expiration;
  end if;
  insert into barberflow_private.subscription_control_history(shop_id,actor_id,operation,reason,bonus_until)
  values(shop,auth.uid(),operation,btrim(reason),expiration);
  return true;
end;
$$;

create function public.barberflow_shop_access_state(shop uuid) returns text
language sql stable security definer set search_path='' as $$
  select coalesce((select c.status from barberflow_private.subscription_controls c where c.shop_id=shop),'normal');
$$;

create or replace function barberflow_private.subscription_bookable(shop uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.barberflow_shop_access_state(shop)='normal' and coalesce(greatest(
    (select s.trial_until from public.barberflow_subscriptions s where s.establishment_id=shop),
    (select max(p.ends_before) from public.barberflow_subscription_payments p
      where p.establishment_id=shop and p.starts_on<=(now() at time zone 'America/Sao_Paulo')::date)
  )+(select grace_days from public.barberflow_plan_settings)>(now() at time zone 'America/Sao_Paulo')::date,false)
  or public.barberflow_shop_access_state(shop)='normal' and exists(
    select 1 from barberflow_private.subscription_controls c where c.shop_id=shop
    and c.bonus_until>(now() at time zone 'America/Sao_Paulo')::date
  );
$$;

create function public.barberflow_master_finance(search_text text, page_index integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with shops as (
    select e.id,e.name,e.city,coalesce(c.status,'normal') as status,c.bonus_until,s.trial_until,
      greatest(s.trial_until,c.bonus_until,p.paid_until) as valid_until,p.paid_until
    from public.barberflow_establishments e
    left join barberflow_private.subscription_controls c on c.shop_id=e.id
    left join public.barberflow_subscriptions s on s.establishment_id=e.id
    left join lateral (select max(ends_before) as paid_until from public.barberflow_subscription_payments where establishment_id=e.id) p on true
    where public.barberflow_is_master()
  ), filtered as (
    select * from shops where coalesce(search_text,'')='' or strpos(lower(name),lower(left(search_text,120)))>0 or id::text=search_text
  ), payments as (
    select p.id,p.period,p.reference,p.amount_cents,p.confirmed_at,p.starts_on,p.ends_before,s.name,
      exists(select 1 from public.barberflow_subscription_payments old
        where old.establishment_id=p.establishment_id and old.starts_on<p.starts_on) as renewal
    from public.barberflow_subscription_payments p join filtered s on s.id=p.establishment_id
    order by p.confirmed_at desc,p.id limit 25 offset greatest(0,least(page_index,100000))*25
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'payments_total',(select count(*) from public.barberflow_subscription_payments p join filtered s on s.id=p.establishment_id),
    'paid',(select coalesce(sum(amount_cents),0) from public.barberflow_subscription_payments p join filtered s on s.id=p.establishment_id),
    'restricted',(select count(*) from filtered where status<>'normal'),
    'valid',(select count(*) from filtered where status='normal' and valid_until>(now() at time zone 'America/Sao_Paulo')::date),
    'shops',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from (
      select * from filtered order by name,id limit 25 offset greatest(0,least(page_index,100000))*25
    ) r),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.confirmed_at desc,p.id) from payments p),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc) from (
      select h.id,h.operation,h.reason,h.created_at,h.bonus_until,s.name
      from barberflow_private.subscription_control_history h join filtered s on s.id=h.shop_id
      order by h.created_at desc,h.id desc limit 25
    ) h),'[]'::jsonb)
  ) where public.barberflow_is_master();
$$;

revoke all on function public.barberflow_touch_activity(),public.barberflow_master_users(text,integer),
  public.barberflow_master_recovery_email(uuid),public.barberflow_master_subscription_control(uuid,text,integer,text),
  public.barberflow_shop_access_state(uuid),public.barberflow_master_finance(text,integer) from public,anon;
grant execute on function public.barberflow_touch_activity(),public.barberflow_master_users(text,integer),
  public.barberflow_master_recovery_email(uuid),public.barberflow_master_subscription_control(uuid,text,integer,text),
  public.barberflow_shop_access_state(uuid),public.barberflow_master_finance(text,integer) to authenticated;

create function barberflow_private.prevent_restricted_showcase_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if public.barberflow_shop_access_state(new.establishment_id)<>'normal' then
    raise exception using errcode='22023',message='Shop unavailable';
  end if;
  return new;
end;
$$;
revoke all on function barberflow_private.prevent_restricted_showcase_order() from public,anon,authenticated;
create trigger barberflow_restricted_showcase_order before insert on public.barberflow_showcase_orders
for each row execute function barberflow_private.prevent_restricted_showcase_order();

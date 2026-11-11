begin;
alter table public.barberflow_plan_settings alter column grace_days set default 0;
update public.barberflow_plan_settings set grace_days=0, support_whatsapp='5511948318576';

create function barberflow_private.subscription_status(shop uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with clock as (
    select (now() at time zone 'America/Sao_Paulo')::date as today
  ), status as (
    select t.today, c.status as admin_status, c.bonus_until, s.trial_until,
      p.plan, p.ends_before as paid_until, cfg.grace_days
    from public.barberflow_establishments e
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
    'state', case when admin_status in ('blocked','frozen') then admin_status
      when coalesce(access_until<=today,true) then 'expired' else 'normal' end,
    'plan', case when paid_until>today then coalesce(plan,'legacy')
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
revoke all on function barberflow_private.subscription_status(uuid) from public,anon,authenticated;

create or replace function public.barberflow_shop_access_state(shop uuid) returns text
language sql stable security definer set search_path='' as $$
  select coalesce(barberflow_private.subscription_status(shop)->>'state','expired');
$$;

create function public.barberflow_subscription_status(shop uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select barberflow_private.subscription_status(shop)
  where public.barberflow_is_master() or exists (
    select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid())
  );
$$;
revoke all on function public.barberflow_subscription_status(uuid) from public,anon;
grant execute on function public.barberflow_subscription_status(uuid) to authenticated;

create or replace function barberflow_private.subscription_bookable(shop uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.barberflow_shop_access_state(shop)='normal';
$$;

create or replace function barberflow_private.require_bookable_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.kind='appointment' and new.state<>'cancelled'
    and not barberflow_private.subscription_bookable(new.establishment_id) then
    raise exception using errcode='22023', message='Assinatura sem acesso ativo para agendamentos.';
  end if;
  return new;
end;
$$;

create or replace function public.barberflow_master_finance(search_text text, page_index integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with shops as (
    select e.id,e.name,e.city,public.barberflow_shop_access_state(e.id) as status,c.bonus_until,s.trial_until,
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

notify pgrst, 'reload schema';
commit;

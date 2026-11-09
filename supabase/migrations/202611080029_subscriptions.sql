create table public.barberflow_plan_settings (
  singleton boolean primary key default true check(singleton),
  monthly_cents integer not null default 5990 check(monthly_cents between 1 and 99999999),
  yearly_cents integer not null default 55000 check(yearly_cents between 1 and 99999999),
  trial_days integer not null default 14 check(trial_days between 0 and 365),
  pix_key text not null default '' check(char_length(pix_key)<=160),
  instructions text not null default '' check(char_length(instructions)<=1500)
);
insert into public.barberflow_plan_settings default values;

create table public.barberflow_subscriptions (
  establishment_id uuid primary key references public.barberflow_establishments(id),
  trial_until date,
  preferred_period text check(preferred_period in ('monthly','yearly'))
);

create table public.barberflow_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  period text not null check(period in ('monthly','yearly')),
  amount_cents integer not null check(amount_cents between 1 and 99999999),
  reference text not null check(char_length(btrim(reference)) between 1 and 160),
  confirmed_at timestamptz not null default now(),
  starts_on date not null,
  ends_before date not null check(ends_before>starts_on),
  unique(establishment_id,reference)
);
create index barberflow_subscription_payments_shop on public.barberflow_subscription_payments(establishment_id,ends_before desc);

alter table public.barberflow_plan_settings enable row level security;
alter table public.barberflow_subscriptions enable row level security;
alter table public.barberflow_subscription_payments enable row level security;
revoke all on public.barberflow_plan_settings,public.barberflow_subscriptions,public.barberflow_subscription_payments from public,anon,authenticated;
grant select(monthly_cents,yearly_cents,trial_days) on public.barberflow_plan_settings to anon;
grant select,update(monthly_cents,yearly_cents,trial_days,pix_key,instructions) on public.barberflow_plan_settings to authenticated;
grant select on public.barberflow_subscriptions,public.barberflow_subscription_payments to authenticated;
create policy "Read subscription settings" on public.barberflow_plan_settings for select to anon,authenticated using(true);
create policy "Master updates subscription settings" on public.barberflow_plan_settings for update to authenticated
  using((select public.barberflow_is_master())) with check((select public.barberflow_is_master()));
create policy "Read own subscription" on public.barberflow_subscriptions for select to authenticated
  using((select public.barberflow_is_master()) or exists(select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));
create policy "Read own subscription payments" on public.barberflow_subscription_payments for select to authenticated
  using((select public.barberflow_is_master()) or exists(select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));

create function barberflow_private.start_subscription_trial()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.barberflow_subscriptions(establishment_id,trial_until)
    select new.id,(now() at time zone 'America/Sao_Paulo')::date+trial_days
    from public.barberflow_plan_settings where trial_days>0;
  return new;
end;
$$;
revoke all on function barberflow_private.start_subscription_trial() from public,anon,authenticated;
create trigger barberflow_new_subscription_trial after insert on public.barberflow_establishments
for each row execute function barberflow_private.start_subscription_trial();

create function public.barberflow_prefer_plan(shop uuid, selected_period text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if selected_period is null or selected_period not in ('monthly','yearly')
    or not exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid())) then return false; end if;
  insert into public.barberflow_subscriptions(establishment_id,preferred_period) values(shop,selected_period)
  on conflict(establishment_id) do update set preferred_period=excluded.preferred_period;
  return true;
end;
$$;

create function public.barberflow_billing_businesses(search_text text)
returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
  select e.id,e.name from public.barberflow_establishments e
  where public.barberflow_is_master() and char_length(search_text)<=120
    and (search_text='' or strpos(lower(e.name),lower(search_text))>0 or e.id::text=search_text)
  order by e.name,e.id limit 100;
$$;

create function public.barberflow_confirm_subscription_payment(shop uuid, paid_period text, cents integer, payment_reference text)
returns boolean language plpgsql security definer set search_path='' as $$
declare start_date date;
begin
  if not public.barberflow_is_master() or paid_period is null or paid_period not in ('monthly','yearly')
    or cents is null or cents not between 1 and 99999999 or payment_reference is null
    or char_length(btrim(payment_reference)) not between 1 and 160 then return false; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop for update;
  if not found then return false; end if;
  select greatest((now() at time zone 'America/Sao_Paulo')::date,
    (select trial_until from public.barberflow_subscriptions where establishment_id=shop),
    (select max(ends_before) from public.barberflow_subscription_payments where establishment_id=shop)) into start_date;
  insert into public.barberflow_subscription_payments(establishment_id,period,amount_cents,reference,starts_on,ends_before)
  values(shop,paid_period,cents,btrim(payment_reference),start_date,
    (start_date+case when paid_period='monthly' then interval '1 month' else interval '1 year' end)::date)
  on conflict(establishment_id,reference) do nothing;
  return found;
end;
$$;

revoke all on function public.barberflow_prefer_plan(uuid,text),public.barberflow_billing_businesses(text),
  public.barberflow_confirm_subscription_payment(uuid,text,integer,text) from public,anon;
grant execute on function public.barberflow_prefer_plan(uuid,text),public.barberflow_billing_businesses(text),
  public.barberflow_confirm_subscription_payment(uuid,text,integer,text) to authenticated;

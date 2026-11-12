revoke all on public.barberflow_showcase_pix from public, anon, authenticated;
revoke insert(establishment_id,pix_key,merchant,city),update(pix_key,merchant,city)
  on public.barberflow_showcase_pix from authenticated;
revoke execute on function public.barberflow_save_business_pix(uuid,text,text,text) from public, anon;
grant execute on function public.barberflow_save_business_pix(uuid,text,text,text) to authenticated;

create table barberflow_private.payment_control (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true
);
insert into barberflow_private.payment_control default values;
create table barberflow_private.payment_security_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor uuid,
  shop uuid,
  event text not null
);
alter table barberflow_private.payment_control enable row level security;
alter table barberflow_private.payment_security_events enable row level security;
revoke all on barberflow_private.payment_control, barberflow_private.payment_security_events from public, anon, authenticated;

create function public.barberflow_payment_security_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',c.enabled,'events',coalesce((
    select jsonb_agg(to_jsonb(e) order by e.id desc) from (
      select id,created_at,shop,event from barberflow_private.payment_security_events order by id desc limit 30
    ) e
  ),'[]'::jsonb))
  from barberflow_private.payment_control c where public.barberflow_is_master();
$$;

create function public.barberflow_set_payment_control(allow_payments boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_is_master() or allow_payments is null then return false; end if;
  update barberflow_private.payment_control set enabled=allow_payments where enabled is distinct from allow_payments;
  if found then
    insert into barberflow_private.payment_security_events(actor,event)
    values(auth.uid(),case when allow_payments then 'payments_resumed' else 'payments_paused' end);
  end if;
  return true;
end;
$$;
revoke execute on function public.barberflow_payment_security_status(), public.barberflow_set_payment_control(boolean) from public, anon;
grant execute on function public.barberflow_payment_security_status(), public.barberflow_set_payment_control(boolean) to authenticated;

create function barberflow_private.audit_pix_destination() returns trigger
language plpgsql security definer set search_path='' as $$
declare shop_id uuid;
begin
  if tg_table_name='barberflow_showcase_pix' then
    if tg_op='UPDATE' and (new.pix_key,new.merchant,new.city) is not distinct from (old.pix_key,old.merchant,old.city) then return null; end if;
    shop_id := case when tg_op='DELETE' then old.establishment_id else new.establishment_id end;
  elsif (new.pix_key,new.pix_merchant,new.pix_city) is not distinct from (old.pix_key,old.pix_merchant,old.pix_city) then
    return null;
  end if;
  insert into barberflow_private.payment_security_events(actor,shop,event)
  values(auth.uid(),shop_id,'pix_destination_changed');
  return null;
end;
$$;
create trigger audit_business_pix after insert or update or delete on public.barberflow_showcase_pix
for each row execute function barberflow_private.audit_pix_destination();
create trigger audit_plan_pix after update on public.barberflow_plan_settings
for each row execute function barberflow_private.audit_pix_destination();

create function barberflow_private.enforce_payment_control() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not coalesce((select enabled from barberflow_private.payment_control for share),false) then
    raise exception 'Movimenta??es financeiras temporariamente suspensas.' using errcode='P0001';
  end if;
  if tg_level='ROW' then return new; end if;
  return null;
end;
$$;
do $$
declare payment_table regclass;
begin
  foreach payment_table in array array[
    'public.barberflow_subscription_charges'::regclass,
    'public.barberflow_subscription_payments'::regclass,
    'public.barberflow_showcase_orders'::regclass,
    'public.barberflow_showcase_asaas'::regclass,
    'barberflow_private.card_charges'::regclass,
    'barberflow_private.receipt_payments'::regclass,
    'barberflow_private.finance_settlements'::regclass,
    'barberflow_private.commission_receipts'::regclass
  ] loop
    execute format('create trigger enforce_payment_control before insert on %s for each statement execute function barberflow_private.enforce_payment_control()',payment_table);
  end loop;
end;
$$;
create trigger pause_showcase_settlement before update of status on public.barberflow_showcase_orders
for each row when (old.status is distinct from new.status and new.status='paid')
execute function barberflow_private.enforce_payment_control();

create trigger pause_counter_charge before insert or update on barberflow_private.counter_sales
for each row when (new.state in ('pending','paid'))
execute function barberflow_private.enforce_payment_control();

-- A new charge must snapshot the currently configured recipient for its own shop.
create function barberflow_private.verify_pix_recipient() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record;
begin
  if tg_table_name='barberflow_showcase_orders' then
    select p.pix_key,p.merchant,p.city into recipient from public.barberflow_showcase_pix p
    where p.establishment_id=new.establishment_id for share;
  else
    select p.pix_key,p.pix_merchant as merchant,p.pix_city as city into recipient
    from public.barberflow_plan_settings p for share;
  end if;
  if not found or (new.pix_key,new.merchant,new.city) is distinct from
    (recipient.pix_key,recipient.merchant,recipient.city) then
    raise log 'TOP BARBER: invalid Pix recipient snapshot on %',tg_table_name;
    raise exception 'Destino Pix inválido. Gere uma nova cobrança.' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger verify_pix_recipient before insert on public.barberflow_showcase_orders
for each row execute function barberflow_private.verify_pix_recipient();
create trigger verify_pix_recipient before insert on public.barberflow_subscription_charges
for each row execute function barberflow_private.verify_pix_recipient();

revoke select on public.barberflow_plan_settings from authenticated;
grant select(singleton,monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,
  trial_days,instructions,support_whatsapp,grace_days,billing_rules,plan_benefits)
on public.barberflow_plan_settings to authenticated;
create function public.barberflow_master_plan_settings() returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(p) from public.barberflow_plan_settings p where public.barberflow_is_master();
$$;
create function public.barberflow_subscription_pix_ready() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_plan_settings p
    cross join barberflow_private.payment_control c
    where c.enabled and p.pix_key<>'' and p.pix_city<>'' and p.pix_merchant<>'');
$$;
revoke execute on function public.barberflow_master_plan_settings(),public.barberflow_subscription_pix_ready() from public,anon;
grant execute on function public.barberflow_master_plan_settings(),public.barberflow_subscription_pix_ready() to authenticated;

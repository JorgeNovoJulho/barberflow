-- The former storefront account becomes the single Pix account for the business.
revoke insert,update,delete on public.barberflow_showcase_pix from authenticated;
drop policy showcase_pix_owner on public.barberflow_showcase_pix;
revoke select on public.barberflow_showcase_pix from authenticated;

create function public.barberflow_business_pix(shop uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(p)-'establishment_id' from public.barberflow_showcase_pix p
  where p.establishment_id=shop and barberflow_private.finance_unlocked(shop);
$$;

create function public.barberflow_save_business_pix(shop uuid, key_value text, merchant_name text, merchant_city text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.finance_unlocked(shop) then return false; end if;
  if key_value is null then
    delete from public.barberflow_showcase_pix where establishment_id=shop;
  else
    insert into public.barberflow_showcase_pix(establishment_id,pix_key,merchant,city)
      values(shop,key_value,merchant_name,merchant_city)
    on conflict(establishment_id) do update set pix_key=excluded.pix_key,merchant=excluded.merchant,city=excluded.city;
  end if;
  return true;
end;
$$;

create table barberflow_private.card_accounts (
  shop_id uuid primary key references public.barberflow_establishments(id),
  sealed_token text not null,
  collector_id bigint not null check (collector_id>0),
  sandbox boolean not null
);
create table barberflow_private.card_charges (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.barberflow_establishments(id),
  receipt_id uuid not null references public.barberflow_receipts(appointment_id),

  amount bigint not null check(amount between 1 and 99999999),
  collector_id bigint not null,
  sandbox boolean not null,
  sealed_token text not null,
  expires_at timestamptz not null,
  started_at timestamptz not null default now(),
  checkout_url text,
  status text not null default 'open' check (status in ('open','paid','tested','expired')),
  payment_id text unique
);
create unique index card_charges_single_open on barberflow_private.card_charges(receipt_id) where status='open';
alter table barberflow_private.card_accounts enable row level security;
alter table barberflow_private.card_charges enable row level security;
revoke all on barberflow_private.card_accounts,barberflow_private.card_charges from public,anon,authenticated;

create function public.barberflow_card_status(shop uuid, receipt uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'account',(select jsonb_build_object('collector',a.collector_id,'sandbox',a.sandbox)
      from barberflow_private.card_accounts a where a.shop_id=shop),
    'charge',(select jsonb_build_object('id',c.id,'url',c.checkout_url,'expires',c.expires_at,'sandbox',c.sandbox,
      'status',c.status,'amount',c.amount)
      from barberflow_private.card_charges c where c.shop_id=shop and c.receipt_id=receipt
      order by (c.status='open') desc,c.started_at desc,c.id desc limit 1))
  where barberflow_private.finance_unlocked(shop);
$$;

-- Called only by the application server after authenticating the financial session.
create function public.barberflow_set_card_account(shop uuid, ciphertext text, collector bigint, test_mode boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if ciphertext is null then
    delete from barberflow_private.card_accounts where shop_id=shop;
  else
    insert into barberflow_private.card_accounts(shop_id,sealed_token,collector_id,sandbox)
      values(shop,ciphertext,collector,test_mode)
    on conflict(shop_id) do update set sealed_token=excluded.sealed_token,collector_id=excluded.collector_id,sandbox=excluded.sandbox;
  end if;
end;
$$;

create function public.barberflow_begin_card_charge(shop uuid, receipt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare charge barberflow_private.card_charges; account barberflow_private.card_accounts; balance bigint;
begin
  perform 1 from public.barberflow_receipts r where r.establishment_id=shop and r.appointment_id=receipt for update;
  if not found then return null; end if;
  select * into charge from barberflow_private.card_charges c where c.receipt_id=receipt and c.status='open';
  if found then
    if charge.checkout_url is null and charge.started_at>now()-interval '15 seconds' then return null; end if;
    if charge.checkout_url is null and charge.expires_at>now() then
      update barberflow_private.card_charges set started_at=now() where id=charge.id;
    end if;
    return to_jsonb(charge);
  end if;
  select * into account from barberflow_private.card_accounts a where a.shop_id=shop;
  if not found then return null; end if;
  select r.total_cents-coalesce((select sum(p.amount_cents) from barberflow_private.receipt_payments p
    where p.appointment_id=receipt and p.reversed_at is null),0) into balance
    from public.barberflow_receipts r where r.appointment_id=receipt;
  if balance not between 1 and 99999999 then return null; end if;
  insert into barberflow_private.card_charges(shop_id,receipt_id,amount,collector_id,sandbox,sealed_token,expires_at)
    values(shop,receipt,balance,account.collector_id,account.sandbox,account.sealed_token,now()+interval '20 minutes')
    returning * into charge;
  return to_jsonb(charge);
end;
$$;

create function public.barberflow_card_charge(shop uuid, receipt uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(c) from barberflow_private.card_charges c
  where c.shop_id=shop and c.receipt_id=receipt and c.status='open';
$$;

create function public.barberflow_publish_card_charge(charge_id uuid, url_value text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update barberflow_private.card_charges set checkout_url=url_value
  where id=charge_id and status='open' and checkout_url is null and expires_at>now();
  return found;
end;
$$;

create function public.barberflow_finish_card_charge(charge_id uuid, provider_payment text)
returns text language plpgsql security definer set search_path='' as $$
declare charge barberflow_private.card_charges; balance bigint;
begin
  select * into charge from barberflow_private.card_charges where id=charge_id;
  if not found then return 'invalid'; end if;
  perform 1 from public.barberflow_receipts where appointment_id=charge.receipt_id for update;
  select * into charge from barberflow_private.card_charges where id=charge_id for update;
  if charge.status<>'open' then return charge.status; end if;
  if provider_payment is null then
    if charge.expires_at+interval '5 minutes'>now() then return 'open'; end if;
    update barberflow_private.card_charges set status='expired' where id=charge_id;
    return 'expired';
  end if;
  if charge.sandbox then
    update barberflow_private.card_charges set status='tested',payment_id=provider_payment where id=charge_id;
    return 'tested';
  end if;
  select r.total_cents-coalesce((select sum(p.amount_cents) from barberflow_private.receipt_payments p
    where p.appointment_id=charge.receipt_id and p.reversed_at is null),0) into balance
    from public.barberflow_receipts r where r.appointment_id=charge.receipt_id;
  if balance is distinct from charge.amount then return 'review'; end if;
  insert into barberflow_private.receipt_payments(id,appointment_id,amount_cents,method)
    values(charge.id,charge.receipt_id,charge.amount,'card');
  update barberflow_private.card_charges set status='paid',payment_id=provider_payment where id=charge_id;
  return 'paid';
end;
$$;

create or replace function public.barberflow_record_payment(shop uuid, receipt uuid, request_id uuid, cents bigint, payment_method text)
returns boolean language plpgsql security definer set search_path='' as $$
declare bill bigint; received bigint; prior record;
begin
  if not barberflow_private.finance_unlocked(shop) or request_id is null or cents is null or cents<=0 then return false; end if;
  select total_cents into bill from public.barberflow_receipts
    where establishment_id=shop and appointment_id=receipt for update;
  if not found then return false; end if;
  select appointment_id,amount_cents,method into prior from barberflow_private.receipt_payments where id=request_id;
  if found then return prior.appointment_id=receipt and prior.amount_cents=cents and prior.method=payment_method; end if;
  if exists(select 1 from barberflow_private.card_charges c where c.receipt_id=receipt and c.status='open') then return false; end if;
  select coalesce(sum(amount_cents),0) into received from barberflow_private.receipt_payments
    where appointment_id=receipt and reversed_at is null;
  if cents>bill-received then return false; end if;
  insert into barberflow_private.receipt_payments(id,appointment_id,amount_cents,method,recorded_by)
    values(request_id,receipt,cents,payment_method,(select auth.uid())) on conflict do nothing;
  return found;
end;
$$;

create or replace function public.barberflow_reverse_payment(shop uuid, payment uuid, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare receipt uuid;
begin
  if not barberflow_private.finance_unlocked(shop) or reason is null or char_length(btrim(reason)) not between 1 and 240 then return false; end if;
  select r.appointment_id into receipt from public.barberflow_receipts r
    join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
    where p.id=payment and r.establishment_id=shop for update of r;
  if not found or exists(select 1 from barberflow_private.card_charges c where
    (c.receipt_id=receipt and c.status='open') or (c.id=payment and c.status='paid')) then return false; end if;
  update barberflow_private.receipt_payments set reversed_at=now(),reversed_by=(select auth.uid()),reversal_reason=btrim(reason)
    where id=payment and appointment_id=receipt and reversed_at is null;
  return found;
end;
$$;

revoke all on function public.barberflow_business_pix(uuid),public.barberflow_save_business_pix(uuid,text,text,text),
  public.barberflow_card_status(uuid,uuid) from public,anon;
grant execute on function public.barberflow_business_pix(uuid),public.barberflow_save_business_pix(uuid,text,text,text),
  public.barberflow_card_status(uuid,uuid) to authenticated;
revoke all on function public.barberflow_set_card_account(uuid,text,bigint,boolean),public.barberflow_begin_card_charge(uuid,uuid),
  public.barberflow_card_charge(uuid,uuid),public.barberflow_publish_card_charge(uuid,text),public.barberflow_finish_card_charge(uuid,text)
  from public,anon,authenticated;
grant execute on function public.barberflow_set_card_account(uuid,text,bigint,boolean),public.barberflow_begin_card_charge(uuid,uuid),
  public.barberflow_card_charge(uuid,uuid),public.barberflow_publish_card_charge(uuid,text),public.barberflow_finish_card_charge(uuid,text)
  to service_role;

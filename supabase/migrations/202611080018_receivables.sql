create extension if not exists pgcrypto with schema extensions;

create table barberflow_private.finance_access (
  establishment_id uuid primary key references public.barberflow_establishments(id) on delete cascade,
  password_hash text not null,
  failed_attempts integer not null default 0,
  blocked_until timestamptz
);

create table barberflow_private.finance_sessions (
  establishment_id uuid not null references barberflow_private.finance_access(establishment_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  primary key(establishment_id,user_id,session_id)
);

create table barberflow_private.receipt_payments (
  id uuid primary key,
  appointment_id uuid not null references public.barberflow_receipts(appointment_id),
  amount_cents bigint not null check (amount_cents>0),
  method text not null check (method in ('pix','cash','card','transfer','other')),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text check (char_length(btrim(reversal_reason)) between 1 and 240)
);
create index barberflow_receipt_payments_receipt_idx on barberflow_private.receipt_payments(appointment_id);
revoke all on barberflow_private.finance_access,barberflow_private.finance_sessions,barberflow_private.receipt_payments from public,anon,authenticated;

create function barberflow_private.finance_owner(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid()));
$$;

create function barberflow_private.finance_unlocked(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select barberflow_private.finance_owner(shop) and exists(
    select 1 from barberflow_private.finance_sessions s where s.establishment_id=shop
      and s.user_id=(select auth.uid()) and s.session_id::text=(select auth.jwt()->>'session_id') and s.expires_at>now()
  );
$$;

create function public.barberflow_finance_status(shop uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when not barberflow_private.finance_owner(shop) then 'denied'
    when barberflow_private.finance_unlocked(shop) then 'unlocked'
    when exists(select 1 from barberflow_private.finance_access where establishment_id=shop) then 'locked'
    else 'setup' end;
$$;

create function public.barberflow_finance_unlock(shop uuid, secret text, setup boolean)
returns text language plpgsql security definer set search_path='' as $$
declare access_row record; current_session text := (select auth.jwt()->>'session_id');
begin
  if not barberflow_private.finance_owner(shop) or current_session is null then return 'denied'; end if;
  if secret is null or char_length(secret)<8 or octet_length(secret)>72 then return 'invalid'; end if;
  if setup then
    insert into barberflow_private.finance_access(establishment_id,password_hash)
      values(shop,extensions.crypt(secret,extensions.gen_salt('bf',10))) on conflict do nothing;
    if not found then return 'locked'; end if;
  end if;
  select * into access_row from barberflow_private.finance_access where establishment_id=shop for update;
  if not found then return 'setup'; end if;
  if access_row.blocked_until>now() then return 'blocked'; end if;
  if not setup and extensions.crypt(secret,access_row.password_hash)<>access_row.password_hash then
    update barberflow_private.finance_access
      set failed_attempts=case when access_row.blocked_until is not null then 1 else access_row.failed_attempts+1 end,
          blocked_until=case when access_row.blocked_until is null and access_row.failed_attempts>=4 then now()+interval '15 minutes' else null end
      where establishment_id=shop;
    return 'invalid';
  end if;
  update barberflow_private.finance_access set failed_attempts=0,blocked_until=null where establishment_id=shop;
  delete from barberflow_private.finance_sessions where establishment_id=shop and expires_at<=now();
  insert into barberflow_private.finance_sessions(establishment_id,user_id,session_id,expires_at)
    values(shop,(select auth.uid()),current_session::uuid,now()+interval '15 minutes')
  on conflict(establishment_id,user_id,session_id) do update set expires_at=excluded.expires_at;
  return 'unlocked';
end;
$$;

create function public.barberflow_finance_lock(shop uuid)
returns void language sql security definer set search_path='' as $$
  delete from barberflow_private.finance_sessions s where s.establishment_id=shop
    and s.user_id=(select auth.uid()) and s.session_id::text=(select auth.jwt()->>'session_id');
$$;

create function public.barberflow_record_payment(shop uuid, receipt uuid, request_id uuid, cents bigint, payment_method text)
returns boolean language plpgsql security definer set search_path='' as $$
declare bill bigint; received bigint; prior record;
begin
  if not barberflow_private.finance_unlocked(shop) or request_id is null or cents is null or cents<=0 then return false; end if;
  select total_cents into bill from public.barberflow_receipts
    where establishment_id=shop and appointment_id=receipt for update;
  if not found then return false; end if;
  select appointment_id,amount_cents,method into prior from barberflow_private.receipt_payments where id=request_id;
  if found then return prior.appointment_id=receipt and prior.amount_cents=cents and prior.method=payment_method; end if;
  select coalesce(sum(amount_cents),0) into received from barberflow_private.receipt_payments
    where appointment_id=receipt and reversed_at is null;
  if cents>bill-received then return false; end if;
  insert into barberflow_private.receipt_payments(id,appointment_id,amount_cents,method,recorded_by)
    values(request_id,receipt,cents,payment_method,(select auth.uid())) on conflict do nothing;
  return found;
end;
$$;

create function public.barberflow_reverse_payment(shop uuid, payment uuid, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare receipt uuid;
begin
  if not barberflow_private.finance_unlocked(shop) or reason is null or char_length(btrim(reason)) not between 1 and 240 then return false; end if;
  select r.appointment_id into receipt from public.barberflow_receipts r
    join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
    where p.id=payment and r.establishment_id=shop for update of r;
  if not found then return false; end if;
  update barberflow_private.receipt_payments set reversed_at=now(),reversed_by=(select auth.uid()),reversal_reason=btrim(reason)
    where id=payment and appointment_id=receipt and reversed_at is null;
  return found;
end;
$$;

create function public.barberflow_receivables(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with bills as (
    select r.appointment_id,r.closed_at,r.total_cents,a.client_name,
      coalesce(sum(p.amount_cents) filter(where p.reversed_at is null),0) as received_cents
    from public.barberflow_receipts r join public.barberflow_schedule a on a.id=r.appointment_id
    left join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
    where r.establishment_id=shop and barberflow_private.finance_unlocked(shop)
    group by r.appointment_id,r.closed_at,r.total_cents,a.client_name
  ), recent as (
    select * from bills order by (total_cents>received_cents) desc,closed_at desc,appointment_id limit 100
  )
  select jsonb_build_object(
    'open_cents',(select coalesce(sum(total_cents-received_cents),0) from bills),
    'cash_cents',(select coalesce(sum(received_cents),0) from bills),
    'bills',coalesce((
      select jsonb_agg(to_jsonb(r)||jsonb_build_object('payments',coalesce((
        select jsonb_agg(jsonb_build_object('id',p.id,'amount_cents',p.amount_cents,'method',p.method,'recorded_at',p.recorded_at,
          'reversed_at',p.reversed_at,'reversal_reason',p.reversal_reason) order by p.recorded_at desc,p.id)
        from barberflow_private.receipt_payments p where p.appointment_id=r.appointment_id
      ),'[]'::jsonb)) order by (r.total_cents>r.received_cents) desc,r.closed_at desc,r.appointment_id) from recent r
    ),'[]'::jsonb))
  where barberflow_private.finance_unlocked(shop);
$$;

revoke all on function barberflow_private.finance_owner(uuid),barberflow_private.finance_unlocked(uuid) from public,anon,authenticated;
revoke all on function public.barberflow_finance_status(uuid),public.barberflow_finance_unlock(uuid,text,boolean),
  public.barberflow_finance_lock(uuid),public.barberflow_record_payment(uuid,uuid,uuid,bigint,text),
  public.barberflow_reverse_payment(uuid,uuid,text),public.barberflow_receivables(uuid) from public,anon;
grant execute on function public.barberflow_finance_status(uuid),public.barberflow_finance_unlock(uuid,text,boolean),
  public.barberflow_finance_lock(uuid),public.barberflow_record_payment(uuid,uuid,uuid,bigint,text),
  public.barberflow_reverse_payment(uuid,uuid,text),public.barberflow_receivables(uuid) to authenticated;

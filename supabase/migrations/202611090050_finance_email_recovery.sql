create table barberflow_private.finance_email_recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  establishment_id uuid not null references public.barberflow_establishments(id) on delete cascade,
  original_session text not null,
  requested_at timestamptz not null default now()
);
alter table barberflow_private.finance_email_recovery enable row level security;
revoke all on barberflow_private.finance_email_recovery from public,anon,authenticated;

create function public.barberflow_request_finance_email(shop uuid) returns text
language plpgsql security definer set search_path='' as $$
declare owner uuid:=(select auth.uid()); session text:=(select auth.jwt()->>'session_id');
begin
  if session is null or not barberflow_private.finance_owner(shop)
    or not exists(select 1 from barberflow_private.finance_access a where a.establishment_id=shop)
    or not exists(select 1 from auth.users u where u.id=owner and u.email_confirmed_at is not null
      and coalesce(u.banned_until,'-infinity')<=now() and not coalesce(u.is_anonymous,false)) then return 'denied'; end if;
  insert into barberflow_private.finance_email_recovery(user_id,establishment_id,original_session)
    values(owner,shop,session)
    on conflict(user_id) do update set establishment_id=excluded.establishment_id,
      original_session=excluded.original_session,requested_at=now()
    where finance_email_recovery.requested_at<=now()-interval '1 minute';
  return case when found then 'requested' else 'limit' end;
end;
$$;

create function public.barberflow_reset_finance_email(shop uuid, new_secret text) returns text
language plpgsql security definer set search_path='' as $$
declare
  owner uuid:=(select auth.uid());
  claims jsonb:=(select auth.jwt());
  request barberflow_private.finance_email_recovery;
  account_hash text;
begin
  if not barberflow_private.finance_owner(shop) then return 'denied'; end if;
  if new_secret is null or char_length(new_secret)<8 or octet_length(new_secret)>72 then return 'invalid'; end if;
  select * into request from barberflow_private.finance_email_recovery where user_id=owner for update;
  if not found or request.establishment_id<>shop or request.requested_at<=now()-interval '15 minutes'
    or claims->>'session_id' is null or claims->>'session_id'=request.original_session
    or not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(claims->'amr')='array' then claims->'amr' else '[]'::jsonb end) item
      where item->>'method' in ('otp','magiclink') and case when jsonb_typeof(item->'timestamp')='number'
        then (item->>'timestamp')::numeric>floor(extract(epoch from request.requested_at)) else false end
    ) then return 'expired'; end if;
  select u.encrypted_password into account_hash from auth.users u where u.id=owner and u.email_confirmed_at is not null
    and coalesce(u.banned_until,'-infinity')<=now() and not coalesce(u.is_anonymous,false);
  if not found then return 'denied'; end if;
  if exists(select 1 from auth.mfa_factors f where f.user_id=owner and f.status='verified')
    and (claims->>'aal') is distinct from 'aal2' then return 'mfa'; end if;
  if account_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
    and extensions.crypt(new_secret,account_hash)=account_hash then return 'reused'; end if;
  update barberflow_private.finance_access set password_hash=extensions.crypt(new_secret,extensions.gen_salt('bf',10)),
    failed_attempts=0,blocked_until=null where establishment_id=shop;
  if not found then return 'denied'; end if;
  delete from barberflow_private.finance_sessions where establishment_id=shop;
  delete from barberflow_private.finance_email_recovery where user_id=owner;
  return 'reset';
end;
$$;

revoke all on function public.barberflow_request_finance_email(uuid),public.barberflow_reset_finance_email(uuid,text) from public,anon;
grant execute on function public.barberflow_request_finance_email(uuid),public.barberflow_reset_finance_email(uuid,text) to authenticated;

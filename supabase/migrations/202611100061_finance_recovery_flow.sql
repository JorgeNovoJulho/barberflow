create or replace function public.barberflow_finance_status(shop uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when not barberflow_private.finance_owner(shop) then 'denied'
    when barberflow_private.finance_unlocked(shop) then 'unlocked'
    when exists(select 1 from barberflow_private.finance_access where establishment_id=shop and blocked_until>now()) then 'blocked'
    when exists(select 1 from barberflow_private.finance_access where establishment_id=shop) then 'locked'
    else 'setup' end;
$$;

create or replace function public.barberflow_finance_unlock(shop uuid, secret text, setup boolean)
returns text language plpgsql security definer set search_path='' as $$
declare access_row record; attempts integer; current_session text := (select auth.jwt()->>'session_id');
begin
  if not barberflow_private.finance_owner(shop) or current_session is null then return 'denied'; end if;
  if setup and (secret is null or char_length(secret)<8 or octet_length(secret)>72) then return 'invalid'; end if;
  if setup then
    insert into barberflow_private.finance_access(establishment_id,password_hash)
      values(shop,extensions.crypt(secret,extensions.gen_salt('bf',10))) on conflict do nothing;
    if not found then return 'locked'; end if;
  end if;
  select * into access_row from barberflow_private.finance_access where establishment_id=shop for update;
  if not found then return 'setup'; end if;
  if access_row.blocked_until>now() then return 'blocked'; end if;
  if not setup and (case when secret is null or char_length(secret)<8 or octet_length(secret)>72 then true
    else extensions.crypt(secret,access_row.password_hash) is distinct from access_row.password_hash end) then
    attempts:=case when access_row.blocked_until is not null then 1 else access_row.failed_attempts+1 end;
    update barberflow_private.finance_access set failed_attempts=attempts,
      blocked_until=case when attempts>=3 then now()+interval '15 minutes' else null end
      where establishment_id=shop;
    return case when attempts>=3 then 'incorrect_blocked' else 'incorrect_'||(3-attempts)::text end;
  end if;
  update barberflow_private.finance_access set failed_attempts=0,blocked_until=null where establishment_id=shop;
  delete from barberflow_private.finance_sessions where establishment_id=shop and expires_at<=now();
  insert into barberflow_private.finance_sessions(establishment_id,user_id,session_id,expires_at)
    values(shop,(select auth.uid()),current_session::uuid,now()+interval '15 minutes')
  on conflict(establishment_id,user_id,session_id) do update set expires_at=excluded.expires_at;
  return 'unlocked';
end;
$$;

create or replace function public.barberflow_reset_finance_email(shop uuid, new_secret text) returns text
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
  insert into barberflow_private.finance_sessions(establishment_id,user_id,session_id,expires_at)
    values(shop,owner,(claims->>'session_id')::uuid,now()+interval '15 minutes');
  delete from barberflow_private.finance_email_recovery where user_id=owner;
  return 'reset';
end;
$$;


create table barberflow_private.finance_recovery_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0,
  blocked_until timestamptz
);
alter table barberflow_private.finance_recovery_attempts enable row level security;
revoke all on barberflow_private.finance_recovery_attempts from public,anon,authenticated;

create function public.barberflow_reset_finance_password(shop uuid, account_secret text, new_secret text)
returns text language plpgsql security definer set search_path='' as $$
declare
  owner uuid:=(select auth.uid());
  account_hash text;
  attempts barberflow_private.finance_recovery_attempts;
begin
  if not barberflow_private.finance_owner(shop) or not exists(
    select 1 from barberflow_private.finance_access a where a.establishment_id=shop
  ) then return 'denied'; end if;
  if account_secret is null or octet_length(account_secret) not between 1 and 72
    or new_secret is null or char_length(new_secret)<8 or octet_length(new_secret)>72 then return 'invalid'; end if;

  -- Keep a separate user-wide limit so a forgotten financial PIN can be reset during its lockout.
  insert into barberflow_private.finance_recovery_attempts(user_id) values(owner) on conflict do nothing;
  select * into attempts from barberflow_private.finance_recovery_attempts where user_id=owner for update;
  if attempts.blocked_until>now() then return 'blocked'; end if;
  if attempts.blocked_until is not null then attempts.failed_attempts:=0; end if;

  select u.encrypted_password into account_hash from auth.users u where u.id=owner
    and u.email_confirmed_at is not null and coalesce(u.banned_until,'-infinity')<=now()
    and not coalesce(u.is_anonymous,false);
  if exists(select 1 from auth.mfa_factors f where f.user_id=owner and f.status='verified')
    and (select auth.jwt()->>'aal') is distinct from 'aal2' then return 'mfa'; end if;
  if account_hash is null or account_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' then return 'no_password'; end if;

  if extensions.crypt(account_secret,account_hash) is distinct from account_hash then
    update barberflow_private.finance_recovery_attempts set
      failed_attempts=attempts.failed_attempts+1,
      blocked_until=case when attempts.failed_attempts>=4 then now()+interval '15 minutes' end
    where user_id=owner;
    return case when attempts.failed_attempts>=4 then 'blocked' else 'incorrect' end;
  end if;
  if new_secret=account_secret then return 'reused'; end if;
  update barberflow_private.finance_access set password_hash=extensions.crypt(new_secret,extensions.gen_salt('bf',10)),
    failed_attempts=0,blocked_until=null where establishment_id=shop;
  delete from barberflow_private.finance_sessions where establishment_id=shop;
  delete from barberflow_private.finance_recovery_attempts where user_id=owner;
  return 'reset';
end;
$$;
revoke all on function public.barberflow_reset_finance_password(uuid,text,text) from public,anon;
grant execute on function public.barberflow_reset_finance_password(uuid,text,text) to authenticated;

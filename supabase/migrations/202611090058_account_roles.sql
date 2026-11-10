-- To roll back the application, keep the role data and remove the restrictive
-- shop insert policy and team trigger if the previous account rules must resume.
create table barberflow_private.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('cliente','barbearia'))
);
insert into barberflow_private.account_roles
select u.id, case when u.raw_user_meta_data->>'account_intent' is distinct from 'barbearia'
  and not exists(select 1 from public.barberflow_establishments e where e.owner_id=u.id)
  and not exists(select 1 from barberflow_private.master_account m where m.user_id=u.id)
  and not exists(select 1 from barberflow_private.team_access t where t.user_id=u.id and t.revoked_at is null)
  then 'cliente' else 'barbearia' end
from auth.users u;

create function barberflow_private.capture_account_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.raw_app_meta_data->>'provider'='email' then
    insert into barberflow_private.account_roles values(new.id,
      case when new.raw_user_meta_data->>'account_intent'='barbearia' then 'barbearia' else 'cliente' end);
  end if;
  return new;
end;
$$;
create trigger capture_barberflow_account_role after insert on auth.users
for each row execute function barberflow_private.capture_account_role();

create function public.barberflow_account_kind() returns text
language sql stable security definer set search_path='' as $$
  select r.kind from barberflow_private.account_roles r join auth.users u on u.id=r.user_id
  where r.user_id=auth.uid() and u.email_confirmed_at is not null;
$$;

create function public.barberflow_initialize_google_account(chosen_kind text) returns text
language plpgsql security definer set search_path='' as $$
begin
  if chosen_kind in ('cliente','barbearia') and exists(
    select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null and raw_app_meta_data->>'provider'='google'
  ) then
    insert into barberflow_private.account_roles values(auth.uid(),chosen_kind) on conflict do nothing;
  end if;
  return public.barberflow_account_kind();
end;
$$;

create policy "Only professional accounts create shops" on public.barberflow_establishments
as restrictive for insert to authenticated with check ((select public.barberflow_account_kind())='barbearia');

create function barberflow_private.require_professional_team_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id
    and not exists(select 1 from barberflow_private.account_roles r where r.user_id=new.user_id and r.kind='barbearia')
  then raise exception 'Professional account required' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger require_professional_team_account before update of user_id on barberflow_private.team_access
for each row execute function barberflow_private.require_professional_team_account();

revoke all on function public.barberflow_account_kind(),public.barberflow_initialize_google_account(text) from public,anon;
grant execute on function public.barberflow_account_kind(),public.barberflow_initialize_google_account(text) to authenticated;

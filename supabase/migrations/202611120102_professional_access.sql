create function public.barberflow_active_professionals(shop_id uuid)
returns table(id uuid,name text,photo_url text)
language sql stable security definer set search_path='' as $$
  select p.id,p.name,p.photo_url from public.barberflow_professionals p
  where p.establishment_id=shop_id and p.active
    and exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid())
    and exists(select 1 from barberflow_private.team_access t
      join barberflow_private.account_activity a on a.user_id=t.user_id
      where t.establishment_id=shop_id and t.professional_id=p.id and t.accepted_at is not null
        and t.revoked_at is null and a.seen_at>now()-interval '3 minutes')
  order by p.name,p.id;
$$;
revoke all on function public.barberflow_active_professionals(uuid) from public,anon;
grant execute on function public.barberflow_active_professionals(uuid) to authenticated;

create function barberflow_private.guard_managed_professional_auth() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.raw_app_meta_data->>'barberflow_managed_professional'='true'
    and (old.encrypted_password,old.email) is distinct from (new.encrypted_password,new.email)
    and old.raw_app_meta_data->>'barberflow_credential_revision' is not distinct from new.raw_app_meta_data->>'barberflow_credential_revision'
  then raise exception 'Managed credentials require the establishment owner.' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger barberflow_guard_managed_professional_auth before update of encrypted_password,email on auth.users
for each row execute function barberflow_private.guard_managed_professional_auth();

create table barberflow_private.managed_professionals (
  shop uuid not null,
  professional uuid not null,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  login text not null,
  primary key(shop,professional),
  unique(shop,login),
  foreign key(shop,professional) references public.barberflow_professionals(establishment_id,id) on delete cascade
);
revoke all on barberflow_private.managed_professionals from public,anon,authenticated;

create function public.barberflow_managed_professional_binding(shop_id uuid, person uuid, actor uuid, account uuid, alias text)
returns boolean language plpgsql security definer set search_path='' as $$
declare address text;
begin
  if not exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=actor) then return false; end if;
  select u.email into address from auth.users u where u.id=account and u.email_confirmed_at is not null
    and u.raw_app_meta_data->>'barberflow_managed_professional'='true';
  if address is null or alias !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then return false; end if;
  insert into barberflow_private.managed_professionals values(shop_id,person,account,alias);
  insert into barberflow_private.team_access(establishment_id,email,professional_id,user_id,token_hash,accepted_at)
    values(shop_id,address,person,account,extensions.gen_random_bytes(32),now());
  return true;
end;
$$;

create function public.barberflow_managed_professional_access(shop_id uuid, person uuid, actor uuid)
returns table(user_id uuid,login text)
language sql stable security definer set search_path='' as $$
  select m.user_id,m.login from barberflow_private.managed_professionals m
  where m.shop=shop_id and m.professional=person
    and exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=actor);
$$;
create function public.barberflow_managed_professional_destination()
returns uuid language sql stable security definer set search_path='' as $$
  select m.shop from barberflow_private.managed_professionals m
  where m.user_id=auth.uid() and barberflow_private.individual_professional(m.shop)=m.professional
    and exists(select 1 from auth.sessions s where s.user_id=m.user_id and s.id::text=auth.jwt()->>'session_id');
$$;
revoke all on function public.barberflow_managed_professional_binding(uuid,uuid,uuid,uuid,text),
  public.barberflow_managed_professional_access(uuid,uuid,uuid),public.barberflow_managed_professional_destination() from public,anon,authenticated;
grant execute on function public.barberflow_managed_professional_binding(uuid,uuid,uuid,uuid,text),
  public.barberflow_managed_professional_access(uuid,uuid,uuid) to service_role;
grant execute on function public.barberflow_managed_professional_destination() to authenticated;

create function public.barberflow_set_managed_professional_block(shop_id uuid, person uuid, blocked boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if blocked is null or not exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid())
  then return false; end if;
  update barberflow_private.team_access t set revoked_at=case when blocked then now() else null end
  from barberflow_private.managed_professionals m
  where m.shop=shop_id and m.professional=person and t.establishment_id=m.shop and t.professional_id=person and t.user_id=m.user_id;
  if not found then return false; end if;
  if blocked then
    delete from auth.sessions s using barberflow_private.managed_professionals m
    where m.shop=shop_id and m.professional=person and s.user_id=m.user_id;
    delete from barberflow_private.account_activity a using barberflow_private.managed_professionals m
    where m.shop=shop_id and m.professional=person and a.user_id=m.user_id;
  end if;
  return true;
end;
$$;
create function public.barberflow_managed_professional_roster(shop_id uuid)
returns table(professional_id uuid,login text,blocked boolean)
language sql stable security definer set search_path='' as $$
  select m.professional,m.login,t.revoked_at is not null from barberflow_private.managed_professionals m
  join barberflow_private.team_access t on t.establishment_id=m.shop and t.professional_id=m.professional and t.user_id=m.user_id
  where m.shop=shop_id and exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid());
$$;
revoke all on function public.barberflow_set_managed_professional_block(uuid,uuid,boolean),
  public.barberflow_managed_professional_roster(uuid) from public,anon;
grant execute on function public.barberflow_set_managed_professional_block(uuid,uuid,boolean),
  public.barberflow_managed_professional_roster(uuid) to authenticated;

create function barberflow_private.reserve_managed_professional_email() returns trigger
language plpgsql set search_path='' as $$
begin
  if lower(new.email) like '%@equipe.topbarberflow.com.br'
    and new.raw_app_meta_data->>'barberflow_managed_professional' is distinct from 'true'
  then raise exception 'Email reserved for managed credentials.' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger barberflow_reserve_managed_professional_email before insert or update of email on auth.users
for each row execute function barberflow_private.reserve_managed_professional_email();

create or replace function barberflow_private.individual_professional(shop_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select case when count(distinct t.professional_id)=1 then (array_agg(distinct t.professional_id))[1] end
  from barberflow_private.team_access t
  join public.barberflow_professionals p on p.establishment_id=t.establishment_id and p.id=t.professional_id
  where t.establishment_id=shop_id and t.user_id=auth.uid() and t.accepted_at is not null
    and t.revoked_at is null and p.active
    and (not exists(select 1 from barberflow_private.managed_professionals m where m.user_id=t.user_id)
      or exists(select 1 from auth.sessions s where s.user_id=t.user_id and s.id::text=auth.jwt()->>'session_id'));
$$;
notify pgrst, 'reload schema';

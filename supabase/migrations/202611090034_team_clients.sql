alter table barberflow_private.team_access
  add column manage_clients boolean not null default false,
  drop constraint team_access_check,
  add constraint team_access_scope check(professional_id is not null or see_all or manage_clients);

drop function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean);
drop function public.barberflow_team_members(uuid);

create function public.barberflow_invite_team(shop uuid, invite_email text, professional uuid, see_agendas boolean, manage_agendas boolean, edit_clients boolean)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); normalized text:=lower(btrim(invite_email));
begin
  if normalized is null or char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or see_agendas is null or manage_agendas is null or edit_clients is null or (professional is null and not (see_agendas or manage_agendas or edit_clients)) then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  if professional is not null and not exists(select 1 from public.barberflow_professionals p
    where p.id=professional and p.establishment_id=shop and p.active) then return null; end if;
  insert into barberflow_private.team_access(establishment_id,email,professional_id,see_all,manage_all,manage_clients,token_hash)
  values(shop,normalized,professional,see_agendas or manage_agendas,manage_agendas,edit_clients,extensions.digest(token,'sha256'))
  on conflict(establishment_id,email) where revoked_at is null do update
    set professional_id=excluded.professional_id,see_all=excluded.see_all,manage_all=excluded.manage_all,manage_clients=excluded.manage_clients,
      token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where team_access.accepted_at is null;
  return case when found then token end;
end;
$$;

create function public.barberflow_team_members(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,manage_clients boolean,expires_at timestamptz,accepted_at timestamptz)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.manage_clients,t.expires_at,t.accepted_at
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;

create function public.barberflow_team_can_edit_clients(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from barberflow_private.team_access t
    where t.establishment_id=shop and t.user_id=(select auth.uid())
      and t.revoked_at is null and t.accepted_at is not null and t.manage_clients);
$$;

create policy "Delegates manage authorized clients" on public.barberflow_clients
  for all to authenticated using(public.barberflow_team_can_edit_clients(establishment_id))
  with check(public.barberflow_team_can_edit_clients(establishment_id));

create function public.barberflow_team_client_history(shop uuid, client uuid)
returns table(id uuid,service_name text,state text,starts_at timestamp)
language sql stable security definer set search_path='' as $$
  select a.id,a.service_name,a.state,a.starts_at
  from public.barberflow_schedule a
  where a.establishment_id=shop and a.client_id=client and a.kind='appointment'
    and public.barberflow_team_can_edit_clients(shop)
  order by a.starts_at desc,a.id limit 25;
$$;

revoke all on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_can_edit_clients(uuid),
  public.barberflow_team_client_history(uuid,uuid) from public,anon;
grant execute on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_can_edit_clients(uuid),
  public.barberflow_team_client_history(uuid,uuid) to authenticated;

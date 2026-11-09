alter table barberflow_private.team_access
  add column manage_services boolean not null default false,
  drop constraint team_access_scope,
  add constraint team_access_scope check(professional_id is not null or see_all or manage_clients or manage_services);

drop function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean);
drop function public.barberflow_team_members(uuid);

create function public.barberflow_invite_team(shop uuid, invite_email text, professional uuid, see_agendas boolean, manage_agendas boolean, edit_clients boolean, edit_services boolean)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); normalized text:=lower(btrim(invite_email));
begin
  if normalized is null or char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or see_agendas is null or manage_agendas is null or edit_clients is null or edit_services is null or (professional is null and not (see_agendas or manage_agendas or edit_clients or edit_services)) then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  if professional is not null and not exists(select 1 from public.barberflow_professionals p
    where p.id=professional and p.establishment_id=shop and p.active) then return null; end if;
  insert into barberflow_private.team_access(establishment_id,email,professional_id,see_all,manage_all,manage_clients,manage_services,token_hash)
  values(shop,normalized,professional,see_agendas or manage_agendas,manage_agendas,edit_clients,edit_services,extensions.digest(token,'sha256'))
  on conflict(establishment_id,email) where revoked_at is null do update
    set professional_id=excluded.professional_id,see_all=excluded.see_all,manage_all=excluded.manage_all,manage_clients=excluded.manage_clients,manage_services=excluded.manage_services,
      token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where team_access.accepted_at is null;
  return case when found then token end;
end;
$$;

create function public.barberflow_team_members(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,manage_clients boolean,manage_services boolean,expires_at timestamptz,accepted_at timestamptz)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.manage_clients,t.manage_services,t.expires_at,t.accepted_at
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;

create function public.barberflow_team_can_edit_services(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from barberflow_private.team_access t
    where t.establishment_id=shop and t.user_id=(select auth.uid())
      and t.revoked_at is null and t.accepted_at is not null and t.manage_services);
$$;

create policy "Delegates manage authorized services" on public.barberflow_services
  for all to authenticated using(public.barberflow_team_can_edit_services(establishment_id))
  with check(public.barberflow_team_can_edit_services(establishment_id));

create or replace function public.barberflow_move_service(shop uuid, service uuid, neighbor uuid, step integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  catalog uuid[];
  source_position integer;
  target_position integer;
begin
  if step is null or step not in (-1,1) then return false; end if;
  perform 1 from public.barberflow_establishments e
    where e.id=shop and (e.owner_id=(select auth.uid()) or public.barberflow_team_can_edit_services(shop)) for update;
  if not found then return false; end if;

  perform 1 from public.barberflow_services s where s.establishment_id=shop order by s.id for update;
  select array_agg(s.id order by s.display_order,s.name,s.id) into catalog
    from public.barberflow_services s where s.establishment_id=shop and s.active;
  source_position:=array_position(catalog,service);
  target_position:=array_position(catalog,neighbor);
  if source_position is null or target_position is null
    or target_position<>source_position+step or cardinality(catalog)>10000 then return false; end if;

  catalog[source_position]:=neighbor;
  catalog[target_position]:=service;
  update public.barberflow_services s set display_order=(ordered.position-1)::integer
    from unnest(catalog) with ordinality as ordered(id,position)
    where s.establishment_id=shop and s.id=ordered.id and s.display_order<>ordered.position-1;
  return true;
end;
$$;

revoke all on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_can_edit_services(uuid) from public,anon;
grant execute on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_can_edit_services(uuid) to authenticated;

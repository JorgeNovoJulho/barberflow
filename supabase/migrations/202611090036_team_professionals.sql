alter table barberflow_private.team_access
  add column manage_professionals boolean not null default false,
  drop constraint team_access_scope,
  add constraint team_access_scope check(professional_id is not null or see_all or manage_clients or manage_services or manage_professionals);

drop function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean);
drop function public.barberflow_team_members(uuid);

create function public.barberflow_invite_team(shop uuid, invite_email text, professional uuid, see_agendas boolean, manage_agendas boolean, edit_clients boolean, edit_services boolean, edit_professionals boolean)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); normalized text:=lower(btrim(invite_email));
begin
  if normalized is null or char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or see_agendas is null or manage_agendas is null or edit_clients is null or edit_services is null or edit_professionals is null or (professional is null and not (see_agendas or manage_agendas or edit_clients or edit_services or edit_professionals)) then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  if professional is not null and not exists(select 1 from public.barberflow_professionals p
    where p.id=professional and p.establishment_id=shop and p.active) then return null; end if;
  insert into barberflow_private.team_access(establishment_id,email,professional_id,see_all,manage_all,manage_clients,manage_services,manage_professionals,token_hash)
  values(shop,normalized,professional,see_agendas or manage_agendas,manage_agendas,edit_clients,edit_services,edit_professionals,extensions.digest(token,'sha256'))
  on conflict(establishment_id,email) where revoked_at is null do update
    set professional_id=excluded.professional_id,see_all=excluded.see_all,manage_all=excluded.manage_all,manage_clients=excluded.manage_clients,manage_services=excluded.manage_services,manage_professionals=excluded.manage_professionals,
      token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where team_access.accepted_at is null;
  return case when found then token end;
end;
$$;

create function public.barberflow_team_members(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,manage_clients boolean,manage_services boolean,manage_professionals boolean,expires_at timestamptz,accepted_at timestamptz)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.manage_clients,t.manage_services,t.manage_professionals,t.expires_at,t.accepted_at
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;

create function public.barberflow_team_can_edit_professionals(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from barberflow_private.team_access t
    where t.establishment_id=shop and t.user_id=(select auth.uid())
      and t.revoked_at is null and t.accepted_at is not null and t.manage_professionals);
$$;

do $migration$
declare relation text;
begin
  foreach relation in array array['barberflow_professionals','barberflow_professional_services','barberflow_professional_hours'] loop
    execute format('create policy "Delegates manage professional data" on public.%I to authenticated
      using (public.barberflow_team_can_edit_professionals(establishment_id))
      with check (public.barberflow_team_can_edit_professionals(establishment_id))',relation);
  end loop;
end;
$migration$;

create function public.barberflow_team_assignment_services(shop uuid)
returns table(id uuid,name text,active boolean)
language sql stable security definer set search_path='' as $$
  select s.id,s.name,s.active from public.barberflow_services s
  where s.establishment_id=shop and public.barberflow_team_can_edit_professionals(shop)
  order by s.name,s.id;
$$;

create or replace function public.barberflow_move_professional(shop uuid, professional uuid, neighbor uuid, step integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  catalog uuid[];
  source_position integer;
  target_position integer;
begin
  if step is null or step not in (-1,1) then return false; end if;
  perform 1 from public.barberflow_establishments e
    where e.id=shop and (e.owner_id=(select auth.uid()) or public.barberflow_team_can_edit_professionals(shop)) for update;
  if not found then return false; end if;

  perform 1 from public.barberflow_professionals s where s.establishment_id=shop order by s.id for update;
  select array_agg(s.id order by s.display_order,s.name,s.id) into catalog
    from public.barberflow_professionals s where s.establishment_id=shop and s.active;
  source_position:=array_position(catalog,professional);
  target_position:=array_position(catalog,neighbor);
  if source_position is null or target_position is null
    or target_position<>source_position+step or cardinality(catalog)>10000 then return false; end if;

  catalog[source_position]:=neighbor;
  catalog[target_position]:=professional;
  update public.barberflow_professionals s set display_order=(ordered.position-1)::integer
    from unnest(catalog) with ordinality as ordered(id,position)
    where s.establishment_id=shop and s.id=ordered.id and s.display_order<>ordered.position-1;
  return true;
end;
$$;

create or replace function public.barberflow_owns_profile_media(object_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select cardinality(string_to_array(object_name,'/'))=2
    and (split_part(object_name,'/',2) in ('logo','cover','video','gallery-1','gallery-2',
      'gallery-3','gallery-4','gallery-5','gallery-6','gallery-7','gallery-8')
      or exists(select 1 from public.barberflow_professionals p
        where p.establishment_id::text=split_part(object_name,'/',1)
          and 'professional-'||p.id::text=split_part(object_name,'/',2)))
    and (exists(select 1 from public.barberflow_establishments e
      where e.owner_id=(select auth.uid()) and e.id::text=split_part(object_name,'/',1))
      or exists(select 1 from public.barberflow_professionals p
        where p.establishment_id::text=split_part(object_name,'/',1)
          and 'professional-'||p.id::text=split_part(object_name,'/',2)
          and public.barberflow_team_can_edit_professionals(p.establishment_id)));
$$;

revoke all on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_can_edit_professionals(uuid),
  public.barberflow_team_assignment_services(uuid) from public,anon;
grant execute on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_can_edit_professionals(uuid),
  public.barberflow_team_assignment_services(uuid) to authenticated;

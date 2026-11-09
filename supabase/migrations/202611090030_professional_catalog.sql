alter table public.barberflow_professionals add column display_order integer not null default 0
  check(display_order between 0 and 9999);

create function public.barberflow_move_professional(shop uuid, professional uuid, neighbor uuid, step integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  catalog uuid[];
  source_position integer;
  target_position integer;
begin
  if step is null or step not in (-1,1) then return false; end if;
  perform 1 from public.barberflow_establishments e
    where e.id=shop and e.owner_id=(select auth.uid()) for update;
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

revoke all on function public.barberflow_move_professional(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.barberflow_move_professional(uuid,uuid,uuid,integer) to authenticated;

create or replace function public.barberflow_public_profile(profile_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select payload.profile || jsonb_build_object('details',e.profile_details,'services',coalesce((
    select jsonb_agg(item.value || jsonb_build_object('professionals',coalesce((
      select jsonb_agg(person.value || jsonb_build_object('photo_url',p.photo_url) order by p.display_order,p.name,p.id)
      from jsonb_array_elements(item.value->'professionals') person
      join public.barberflow_professionals p on p.establishment_id=e.id and p.id=(person.value->>'id')::uuid
    ),'[]'::jsonb)) order by s.display_order,s.name,s.id)
    from jsonb_array_elements(payload.profile->'services') item
    join public.barberflow_services s on s.establishment_id=e.id and s.id=(item.value->>'id')::uuid
  ),'[]'::jsonb))
  from public.barberflow_establishments e
  cross join lateral (select barberflow_private.barberflow_public_profile(profile_slug) as profile) payload
  where e.slug=profile_slug and e.published;
$$;

create or replace function public.barberflow_owns_profile_media(object_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select cardinality(string_to_array(object_name,'/'))=2
    and (split_part(object_name,'/',2) in ('logo','cover','video','gallery-1','gallery-2',
      'gallery-3','gallery-4','gallery-5','gallery-6','gallery-7','gallery-8')
      or exists(select 1 from public.barberflow_professionals p
        where p.establishment_id::text=split_part(object_name,'/',1)
          and 'professional-'||p.id::text=split_part(object_name,'/',2)))
    and exists(select 1 from public.barberflow_establishments e
      where e.owner_id=(select auth.uid()) and e.id::text=split_part(object_name,'/',1));
$$;

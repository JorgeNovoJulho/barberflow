create or replace function public.barberflow_set_service_professionals(shop uuid, service uuid, professionals uuid[])
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if professionals is null or not exists (
    select 1 from public.barberflow_establishments e
    where e.id=shop and (e.owner_id=(select auth.uid()) or public.barberflow_team_can_edit_services(shop))
  ) then return false; end if;

  perform 1 from public.barberflow_services s
    where s.establishment_id=shop and s.id=service and s.deleted_at is null for no key update;
  if not found then return false; end if;

  perform 1 from public.barberflow_professionals p
    where p.establishment_id=shop and (p.id=any(professionals) or exists (
      select 1 from public.barberflow_professional_services l
      where l.establishment_id=shop and l.service_id=service and l.professional_id=p.id
    )) order by p.id for update;

  if exists (
    select 1 from unnest(professionals) as chosen(id)
    where not exists (
      select 1 from public.barberflow_professionals p
      where p.establishment_id=shop and p.id=chosen.id and p.active
    )
  ) then return false; end if;

  delete from public.barberflow_professional_services l
    using public.barberflow_professionals p
    where l.establishment_id=shop and l.service_id=service
      and p.establishment_id=shop and p.id=l.professional_id and p.active
      and not (l.professional_id=any(professionals));

  insert into public.barberflow_professional_services(establishment_id,professional_id,service_id)
    select shop,chosen.id,service from (select distinct unnest(professionals) as id) chosen
    where not exists (
      select 1 from public.barberflow_professional_services l
      where l.establishment_id=shop and l.service_id=service and l.professional_id=chosen.id
    );
  return true;
end;
$$;
create function public.barberflow_team_service_assignments(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'professionals', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.photo_url,'active',p.active) order by p.name,p.id)
      from public.barberflow_professionals p where p.establishment_id=shop), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('professional_id',l.professional_id,'service_id',l.service_id))
      from public.barberflow_professional_services l where l.establishment_id=shop), '[]'::jsonb)
  )
  where public.barberflow_team_can_edit_services(shop);
$$;
revoke all on function public.barberflow_team_service_assignments(uuid) from public,anon;
grant execute on function public.barberflow_team_service_assignments(uuid) to authenticated;
notify pgrst, 'reload schema';

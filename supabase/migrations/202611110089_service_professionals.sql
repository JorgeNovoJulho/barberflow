begin;
create function public.barberflow_set_service_professionals(shop uuid, service uuid, professionals uuid[])
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if professionals is null or not exists (
    select 1 from public.barberflow_establishments e
    where e.id=shop and e.owner_id=(select auth.uid())
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
revoke all on function public.barberflow_set_service_professionals(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.barberflow_set_service_professionals(uuid,uuid,uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;

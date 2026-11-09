create function public.barberflow_loyalty_slots(shop uuid)
returns table(slot timestamp,professional_id uuid,professional_name text,service_id uuid,service_name text)
language sql stable security invoker set search_path='' as $$
  select x.slot,p.id,p.name,s.id,s.name
  from public.barberflow_establishments e
  left join public.barberflow_loyalty_rules r on r.establishment_id=e.id and r.enabled
  join public.barberflow_professional_services ps on ps.establishment_id=e.id
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=ps.professional_id and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=ps.service_id and s.active
  cross join lateral public.barberflow_public_slots(e.slug,p.id,s.id,(now() at time zone 'America/Sao_Paulo')::date) x
  where e.id=shop and e.owner_id=(select auth.uid()) and e.published
    and (r.service_ids is null or cardinality(r.service_ids)=0 or s.id=any(r.service_ids))
  order by x.slot,p.name,s.display_order,s.name,p.id,s.id
  limit 30;
$$;

revoke all on function public.barberflow_loyalty_slots(uuid) from public,anon;
grant execute on function public.barberflow_loyalty_slots(uuid) to authenticated;

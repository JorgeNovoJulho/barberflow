create function public.barberflow_move_service(shop uuid, service uuid, neighbor uuid, step integer)
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

revoke all on function public.barberflow_move_service(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.barberflow_move_service(uuid,uuid,uuid,integer) to authenticated;

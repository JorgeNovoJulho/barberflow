create function public.barberflow_directory_map_links(shops uuid[])
returns table(id uuid, map_link text, coordinates text)
language sql stable security definer set search_path='' as $$
  select e.id,e.profile_details->>'map',e.profile_details->>'coordinates' from public.barberflow_establishments e
  where e.published and e.id=any(shops) and cardinality(shops)<=24;
$$;
revoke all on function public.barberflow_directory_map_links(uuid[]) from public;
grant execute on function public.barberflow_directory_map_links(uuid[]) to anon,authenticated;

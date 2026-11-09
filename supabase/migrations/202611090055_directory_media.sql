drop function public.barberflow_public_directory();

create function public.barberflow_public_directory()
returns table(slug text,name text,city text,segment text,logo text,cover text)
language sql stable security definer set search_path='' as $$
  select e.slug,e.name,e.city,e.segment,e.profile_details->>'logo',e.profile_details->>'cover'
  from public.barberflow_establishments e
  where e.published order by e.name,e.slug;
$$;

revoke all on function public.barberflow_public_directory() from public;
grant execute on function public.barberflow_public_directory() to anon,authenticated;

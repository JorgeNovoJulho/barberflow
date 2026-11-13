create or replace function public.barberflow_owns_profile_media(object_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select cardinality(string_to_array(object_name,'/'))=2
    and (split_part(object_name,'/',2) in ('logo','cover','video','gallery-1','gallery-2',
      'gallery-3','gallery-4','gallery-5','gallery-6','gallery-7','gallery-8','gallery-9','gallery-10','gallery-11','gallery-12','gallery-13','gallery-14','gallery-15','gallery-16')
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

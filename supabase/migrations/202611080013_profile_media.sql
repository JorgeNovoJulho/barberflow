insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('barberflow-profile-media','barberflow-profile-media',true,20971520,
  array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']);

create function public.barberflow_owns_profile_media(object_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select cardinality(string_to_array(object_name,'/'))=2
    and split_part(object_name,'/',2) in ('logo','cover','video','gallery-1','gallery-2',
      'gallery-3','gallery-4','gallery-5','gallery-6','gallery-7','gallery-8')
    and exists(select 1 from public.barberflow_establishments e
      where e.owner_id=(select auth.uid()) and e.id::text=split_part(object_name,'/',1));
$$;
revoke all on function public.barberflow_owns_profile_media(text) from public,anon;
grant execute on function public.barberflow_owns_profile_media(text) to authenticated;

create policy "Owner manages public profile media" on storage.objects for all to authenticated
  using (bucket_id='barberflow-profile-media' and public.barberflow_owns_profile_media(name))
  with check (bucket_id='barberflow-profile-media' and public.barberflow_owns_profile_media(name));

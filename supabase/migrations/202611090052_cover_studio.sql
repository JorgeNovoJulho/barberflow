-- Keep each studio export separate from the cover currently saved in the profile.
create policy "Owner uploads generated cover" on storage.objects for insert to authenticated
  with check(bucket_id='barberflow-profile-media'
    and name ~ '^[0-9a-f-]{36}/cover-studio-[0-9a-f-]{36}[.]png$'
    and exists(select 1 from public.barberflow_establishments e
      where e.owner_id=(select auth.uid()) and e.id::text=split_part(storage.objects.name,'/',1)));

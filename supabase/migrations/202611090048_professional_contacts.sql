alter table public.barberflow_professionals
  add column instagram text not null default '' check (instagram ~ '^@?[A-Za-z0-9_.]{0,30}$' and instagram<>'@'),
  add column facebook text not null default '' check (char_length(facebook)<=500),
  add column tiktok text not null default '' check (char_length(tiktok)<=500),
  add column youtube text not null default '' check (char_length(youtube)<=500),
  add column whatsapp text not null default '' check (whatsapp ~ '^([0-9]{10,11}|55[0-9]{10,11})?$');

grant insert(instagram,facebook,tiktok,youtube,whatsapp),update(instagram,facebook,tiktok,youtube,whatsapp)
on public.barberflow_professionals to authenticated;

-- Fresh object names let a profile keep its previous photo if the database write fails.
create policy "Professional photo uploads" on storage.objects for all to authenticated
using (
  bucket_id='barberflow-profile-media' and cardinality(string_to_array(name,'/'))=2
  and split_part(name,'/',2) ~ '^professional-photo-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  and (exists(select 1 from public.barberflow_establishments e
    where e.id::text=split_part(objects.name,'/',1) and e.owner_id=(select auth.uid()))
    or public.barberflow_team_can_edit_professionals(
      case when split_part(name,'/',1) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        then split_part(name,'/',1)::uuid end))
);

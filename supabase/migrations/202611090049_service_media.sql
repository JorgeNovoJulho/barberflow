alter table public.barberflow_services
  add column photo_path text not null default '',
  add column video_path text not null default '',
  add column deleted_at timestamptz,
  add constraint service_deleted_inactive check(deleted_at is null or not active),
  add constraint service_media_paths check (
    (photo_path='' or photo_path ~ ('^'||establishment_id::text||'/[a-f0-9-]{36}-photo$'))
    and (video_path='' or video_path ~ ('^'||establishment_id::text||'/[a-f0-9-]{36}-video$'))
  );
grant insert(photo_path,video_path),update(photo_path,video_path) on public.barberflow_services to authenticated;

create function public.barberflow_service_media_manage(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_establishments e
    where e.id::text=split_part(object_name,'/',1) and (e.owner_id=(select auth.uid())
      or public.barberflow_team_can_edit_services(e.id)))
    and object_name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}-(photo|video)$';
$$;

create function public.barberflow_service_media_public(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_services s join public.barberflow_establishments e on e.id=s.establishment_id
    where e.published and s.active and s.deleted_at is null and object_name<>''
      and (s.photo_path=object_name or s.video_path=object_name));
$$;
revoke all on function public.barberflow_service_media_manage(text),public.barberflow_service_media_public(text) from public;
grant execute on function public.barberflow_service_media_manage(text) to authenticated;
grant execute on function public.barberflow_service_media_public(text) to anon,authenticated;
create index service_photo_path_lookup on public.barberflow_services(photo_path) where photo_path<>'';
create index service_video_path_lookup on public.barberflow_services(video_path) where video_path<>'';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('barberflow-service-media','barberflow-service-media',false,15728640,
  array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']);
create policy service_media_management on storage.objects for all to authenticated
using(bucket_id='barberflow-service-media' and public.barberflow_service_media_manage(name));
create policy service_media_public_read on storage.objects for select to anon,authenticated
using(bucket_id='barberflow-service-media' and public.barberflow_service_media_public(name));

create function public.barberflow_delete_service(shop uuid, service uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.barberflow_establishments e where e.id=shop and
    (e.owner_id=(select auth.uid()) or public.barberflow_team_can_edit_services(e.id))) then return false; end if;
  update public.barberflow_services s set active=false,deleted_at=now()
    where s.establishment_id=shop and s.id=service and s.deleted_at is null;
  return found;
end;
$$;
revoke all on function public.barberflow_delete_service(uuid,uuid) from public,anon;
grant execute on function public.barberflow_delete_service(uuid,uuid) to authenticated;

create or replace function public.barberflow_public_profile(profile_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select payload.profile || jsonb_build_object('details',e.profile_details,'services',coalesce((
    select jsonb_agg(item.value || jsonb_build_object('photo_path',s.photo_path,'video_path',s.video_path,'professionals',coalesce((
      select jsonb_agg(person.value || jsonb_build_object('photo_url',p.photo_url) order by p.display_order,p.name,p.id)
      from jsonb_array_elements(item.value->'professionals') person
      join public.barberflow_professionals p on p.establishment_id=e.id and p.id=(person.value->>'id')::uuid
    ),'[]'::jsonb)) order by s.display_order,s.name,s.id)
    from jsonb_array_elements(payload.profile->'services') item
    join public.barberflow_services s on s.establishment_id=e.id and s.id=(item.value->>'id')::uuid
  ),'[]'::jsonb))
  from public.barberflow_establishments e
  cross join lateral (select barberflow_private.barberflow_public_profile(profile_slug) as profile) payload
  where e.slug=profile_slug and e.published;
$$;

create or replace function public.barberflow_preview_business(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'slug',coalesce(e.slug,''),'name',e.name,'city',e.city,'segment',e.segment,'description',e.public_description,
    'details',e.profile_details,'services',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'category',s.category,
        'photo_path',s.photo_path,'video_path',s.video_path,'price_cents',s.price_cents,'duration_minutes',s.duration_minutes,'professionals',coalesce((
          select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.photo_url) order by p.display_order,p.name,p.id)
          from public.barberflow_professional_services ps
          join public.barberflow_professionals p on p.establishment_id=ps.establishment_id and p.id=ps.professional_id
          where ps.establishment_id=e.id and ps.service_id=s.id and p.active
        ),'[]'::jsonb)) order by s.display_order,s.name,s.id)
      from public.barberflow_services s where s.establishment_id=e.id and s.active
    ),'[]'::jsonb)
  ) from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid());
$$;

create or replace function public.barberflow_team_assignment_services(shop uuid)
returns table(id uuid,name text,active boolean)
language sql stable security definer set search_path='' as $$
  select s.id,s.name,s.active from public.barberflow_services s
  where s.establishment_id=shop and s.deleted_at is null and public.barberflow_team_can_edit_professionals(shop)
  order by s.name,s.id;
$$;

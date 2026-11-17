alter table public.barberflow_services
  add column extra_photos text[] not null default '{}',
  add column video_url text not null default '',
  add constraint service_extra_photos_check check (
    cardinality(extra_photos) <= 4 and
    (cardinality(extra_photos) < 1 or coalesce(extra_photos[1],'') ~ ('^'||establishment_id::text||'/[a-f0-9-]{36}-photo$')) and
    (cardinality(extra_photos) < 2 or coalesce(extra_photos[2],'') ~ ('^'||establishment_id::text||'/[a-f0-9-]{36}-photo$')) and
    (cardinality(extra_photos) < 3 or coalesce(extra_photos[3],'') ~ ('^'||establishment_id::text||'/[a-f0-9-]{36}-photo$')) and
    (cardinality(extra_photos) < 4 or coalesce(extra_photos[4],'') ~ ('^'||establishment_id::text||'/[a-f0-9-]{36}-photo$'))
  ),
  add constraint service_video_url_length check (length(video_url) <= 500);

grant insert(extra_photos,video_url),update(extra_photos,video_url) on public.barberflow_services to authenticated;

create or replace function public.barberflow_service_media_public(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_services s join public.barberflow_establishments e on e.id=s.establishment_id
    where e.published and s.active and s.deleted_at is null and object_name<>''
      and (s.photo_path=object_name or s.video_path=object_name or object_name=any(s.extra_photos)));
$$;
create or replace function public.barberflow_public_profile(profile_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select payload.profile || jsonb_build_object('details',e.profile_details,'services',coalesce((
    select jsonb_agg(item.value || jsonb_build_object('photo_path',s.photo_path,'video_path',s.video_path,'extra_photos',s.extra_photos,'video_url',s.video_url,'professionals',coalesce((
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
        'photo_path',s.photo_path,'video_path',s.video_path,'extra_photos',s.extra_photos,'video_url',s.video_url,'price_cents',s.price_cents,'duration_minutes',s.duration_minutes,'professionals',coalesce((
          select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.photo_url) order by p.display_order,p.name,p.id)
          from public.barberflow_professional_services ps
          join public.barberflow_professionals p on p.establishment_id=ps.establishment_id and p.id=ps.professional_id
          where ps.establishment_id=e.id and ps.service_id=s.id and p.active
        ),'[]'::jsonb)) order by s.display_order,s.name,s.id)
      from public.barberflow_services s where s.establishment_id=e.id and s.active
    ),'[]'::jsonb)
  ) from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid());
$$;

notify pgrst, 'reload schema';

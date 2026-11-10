alter table public.barberflow_social_photos drop constraint barberflow_social_photos_check1,
  add column extra_photos text[] not null default '{}',
  add constraint social_post_content check ((object_path<>'' or btrim(caption)<>'')
    and (object_path='' or object_path ~ ('^'||author::text||'/[0-9a-f-]{36}$'))
    and cardinality(extra_photos)<=2
    and array_position(extra_photos,null) is null
    and (cardinality(extra_photos)=0 or (object_path<>'' and
      coalesce(extra_photos[1],'') ~ ('^'||author::text||'/[0-9a-f-]{36}$')
      and (cardinality(extra_photos)=1 or coalesce(extra_photos[2],'') ~ ('^'||author::text||'/[0-9a-f-]{36}$')))));
grant insert(extra_photos),update(extra_photos) on public.barberflow_social_photos to authenticated;
alter policy social_media_read on storage.objects using(bucket_id='barberflow-social' and (
  split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.barberflow_social_profiles p where not p.frozen and name in(p.avatar,p.banner))
  or exists(select 1 from public.barberflow_social_photos p where p.object_path=name or name=any(p.extra_photos))));

create or replace function public.barberflow_social_feed(page_number integer) returns setof public.barberflow_social_photos
language sql stable security invoker set search_path='' as $$
  select p.* from public.barberflow_social_photos p
  where p.audience='public' or p.author=auth.uid()
    or exists(select 1 from public.barberflow_social_follow_users f where f.follower=auth.uid() and f.target=p.author and p.shop is null)
    or exists(select 1 from public.barberflow_social_follow_shops f where f.follower=auth.uid() and f.shop=p.shop)
  order by p.created_at desc,p.id limit 13 offset greatest(0,least(page_number,10000))*12;
$$;

create function public.barberflow_profile_summary(subject uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('joined',u.created_at,'followers',public.barberflow_social_connections(subject,'followers',0)->'count',
    'following',public.barberflow_social_connections(subject,'following',0)->'count')
  from auth.users u where u.id=subject and auth.uid() is not null
    and not barberflow_private.social_blocked(auth.uid(),subject)
    and (subject=auth.uid() or barberflow_private.social_active(subject));
$$;

create function public.barberflow_booking_shop_media()
returns table(id uuid,slug text,logo text,cover text)
language sql stable security definer set search_path='' as $$
  select a.id,case when e.published then e.slug end,
    e.profile_details->>'logo',e.profile_details->>'cover'
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  where a.booked_by=auth.uid() order by a.starts_at desc limit 100;
$$;

revoke all on function public.barberflow_profile_summary(uuid),public.barberflow_booking_shop_media() from public,anon;
grant execute on function public.barberflow_profile_summary(uuid),public.barberflow_booking_shop_media() to authenticated;


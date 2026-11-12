begin;
alter table public.barberflow_social_photos
  drop constraint barberflow_social_photos_audience_check,
  add constraint barberflow_social_photos_audience_check check(audience in ('public','followers','private') or (audience='web' and shop is not null)),
  add column request_id uuid,
  add constraint social_post_author_request unique(author,request_id);
grant insert(request_id) on public.barberflow_social_photos to authenticated;

create or replace function barberflow_private.social_photo_visible(photo_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_social_photos p where p.id=photo_id and
    (p.author=auth.uid() or (case when p.shop is null then barberflow_private.social_active(p.author)
      else barberflow_private.social_shop(p.shop) end)
      and (p.audience in ('public','web') or p.audience='followers' and (
        p.shop is null and exists(select 1 from public.barberflow_social_follow_users where follower=auth.uid() and target=p.author)
        or p.shop is not null and exists(select 1 from public.barberflow_social_follow_shops where follower=auth.uid() and shop=p.shop)))));
$$;

create or replace function public.barberflow_social_feed(page_number integer) returns setof public.barberflow_social_photos
language sql stable security invoker set search_path='' as $$
  select p.* from public.barberflow_social_photos p
  where p.audience in ('public','web') or p.author=auth.uid()
    or exists(select 1 from public.barberflow_social_follow_users f where f.follower=auth.uid() and f.target=p.author and p.shop is null)
    or exists(select 1 from public.barberflow_social_follow_shops f where f.follower=auth.uid() and f.shop=p.shop)
  order by p.created_at desc,p.id limit 13 offset greatest(0,least(page_number,10000))*12;
$$;

create function public.barberflow_public_shop_feed(shop_slug text)
returns table(id uuid, caption text, object_path text, extra_photos text[], created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select p.id,p.caption,p.object_path,p.extra_photos,p.created_at
  from public.barberflow_social_photos p
  join public.barberflow_establishments e on e.id=p.shop
  where e.published and e.slug=shop_slug and (
    (auth.uid() is null and p.audience='web') or
    (auth.uid() is not null and barberflow_private.social_photo_visible(p.id))
  )
  order by p.created_at desc,p.id limit 12;
$$;

create function public.barberflow_public_post_media(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.barberflow_social_photos p
    join public.barberflow_establishments e on e.id=p.shop
    where e.published and p.audience='web'
      and (p.object_path=object_name or object_name=any(p.extra_photos))
  );
$$;
revoke all on function public.barberflow_public_shop_feed(text),public.barberflow_public_post_media(text) from public;
grant execute on function public.barberflow_public_shop_feed(text),public.barberflow_public_post_media(text) to anon,authenticated;
create policy public_shop_post_media on storage.objects for select to anon
  using(bucket_id='barberflow-social' and public.barberflow_public_post_media(name));

notify pgrst, 'reload schema';
commit;

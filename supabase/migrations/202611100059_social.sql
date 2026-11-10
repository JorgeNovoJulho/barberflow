create table public.barberflow_social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  username text not null check(username ~ '^[A-Za-z0-9_.-]{3,40}$'),
  avatar text not null default '',
  banner text not null default '',
  links jsonb not null default '{}' check(jsonb_typeof(links)='object'
    and links-array['Instagram','Facebook','YouTube','TikTok']='{}'::jsonb and char_length(links::text)<=1350
    and coalesce(links->>'Instagram','https://instagram.com') ~* '^https://([a-z0-9-]+[.])*instagram[.]com(/|$)'
    and coalesce(links->>'Facebook','https://facebook.com') ~* '^https://([a-z0-9-]+[.])*(facebook|fb)[.]com(/|$)'
    and coalesce(links->>'YouTube','https://youtube.com') ~* '^https://([a-z0-9-]+[.])*(youtube[.]com|youtu[.]be)(/|$)'
    and coalesce(links->>'TikTok','https://tiktok.com') ~* '^https://([a-z0-9-]+[.])*tiktok[.]com(/|$)'),
  theme text not null default 'claro' check(theme in ('claro','rosa','verde','azul')),
  frozen boolean not null default false
);
create unique index barberflow_social_username on public.barberflow_social_profiles(lower(username));

create table public.barberflow_social_photos (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shop uuid references public.barberflow_establishments(id) on delete cascade,
  object_path text not null,
  caption text not null default '' check(char_length(caption)<=500),
  audience text not null default 'public' check(audience in ('public','followers','private')),
  promotion boolean not null default false check(not promotion or shop is not null),
  created_at timestamptz not null default now(),
  check(object_path ~ ('^'||author::text||'/[0-9a-f-]{36}$'))
);
create index barberflow_social_photos_time on public.barberflow_social_photos(created_at desc,id);
create index barberflow_social_photos_author on public.barberflow_social_photos(author,created_at desc);
create index barberflow_social_photos_shop on public.barberflow_social_photos(shop,created_at desc);
create table public.barberflow_social_follow_users (
  follower uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target uuid not null references public.barberflow_social_profiles(user_id) on delete cascade,
  primary key(follower,target), check(follower<>target)
);
create index barberflow_follow_target on public.barberflow_social_follow_users(target);
create table public.barberflow_social_follow_shops (
  follower uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shop uuid not null references public.barberflow_establishments(id) on delete cascade,
  primary key(follower,shop)
);
create index barberflow_follow_shop on public.barberflow_social_follow_shops(shop);
create table public.barberflow_social_likes (
  photo uuid not null references public.barberflow_social_photos(id) on delete cascade,
  actor uuid not null default auth.uid() references public.barberflow_social_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(photo,actor)
);
create table public.barberflow_social_comments (
  id uuid primary key default gen_random_uuid(),
  photo uuid not null references public.barberflow_social_photos(id) on delete cascade,
  actor uuid not null default auth.uid() references public.barberflow_social_profiles(user_id) on delete cascade,
  parent uuid,
  body text not null check(char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(photo,id),
  foreign key(photo,parent) references public.barberflow_social_comments(photo,id) on delete cascade
);
create index barberflow_social_comments_photo on public.barberflow_social_comments(photo,created_at desc);
create table public.barberflow_account_deletion_requests (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create function barberflow_private.social_active(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_social_profiles where user_id=actor and not frozen);
$$;
create function barberflow_private.social_shop(shop_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_establishments where id=shop_id and published and slug is not null);
$$;
create function barberflow_private.social_owner(shop_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.barberflow_account_kind()='barbearia' and exists(
    select 1 from public.barberflow_establishments where id=shop_id and owner_id=auth.uid());
$$;
create function barberflow_private.social_eligible(shop_id uuid, purchases boolean) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_schedule where establishment_id=shop_id and booked_by=auth.uid()
    and kind='appointment' and state='completed')
  or (purchases and exists(select 1 from public.barberflow_showcase_orders
    where establishment_id=shop_id and buyer_id=auth.uid() and status in ('paid','ready','collected')));
$$;
create function barberflow_private.social_photo_visible(photo_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_social_photos p where p.id=photo_id and
    (p.author=auth.uid() or (case when p.shop is null then barberflow_private.social_active(p.author)
      else barberflow_private.social_shop(p.shop) end)
      and (p.audience='public' or p.audience='followers' and (
        p.shop is null and exists(select 1 from public.barberflow_social_follow_users where follower=auth.uid() and target=p.author)
        or p.shop is not null and exists(select 1 from public.barberflow_social_follow_shops where follower=auth.uid() and shop=p.shop)))));
$$;
create function barberflow_private.social_replyable(photo_id uuid, comment_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_social_comments where photo=photo_id and id=comment_id
    and parent is null and barberflow_private.social_active(actor));
$$;

create function barberflow_private.social_can_interact(photo_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select barberflow_private.social_active(auth.uid()) and barberflow_private.social_photo_visible(photo_id)
    and exists(select 1 from public.barberflow_social_photos p where p.id=photo_id
      and (p.shop is null or p.author=auth.uid() or barberflow_private.social_eligible(p.shop,false)));
$$;

do $$
declare t text;
begin
  foreach t in array array['social_profiles','social_photos','social_follow_users','social_follow_shops','social_likes','social_comments','account_deletion_requests'] loop
    execute format('alter table public.%I enable row level security','barberflow_'||t);
    execute format('revoke all on public.%I from public,anon,authenticated','barberflow_'||t);
  end loop;
end;
$$;
grant select on public.barberflow_social_profiles,public.barberflow_social_photos,public.barberflow_social_follow_users,
  public.barberflow_social_follow_shops,public.barberflow_social_likes,public.barberflow_social_comments to authenticated;
grant insert(username,avatar,banner,links,theme,frozen),update(username,avatar,banner,links,theme,frozen)
  on public.barberflow_social_profiles to authenticated;
grant insert(shop,object_path,caption,audience,promotion),update(caption,audience,object_path),delete
  on public.barberflow_social_photos to authenticated;
grant insert(target),delete on public.barberflow_social_follow_users to authenticated;
grant insert(shop),delete on public.barberflow_social_follow_shops to authenticated;
grant insert(photo),delete on public.barberflow_social_likes to authenticated;
grant insert(photo,parent,body),delete on public.barberflow_social_comments to authenticated;
grant select,insert(user_id) on public.barberflow_account_deletion_requests to authenticated;

create policy social_profiles_read on public.barberflow_social_profiles for select to authenticated
using (user_id=auth.uid() or not frozen);
create policy social_profiles_create on public.barberflow_social_profiles for insert to authenticated
with check (user_id=auth.uid() and public.barberflow_account_kind() in ('cliente','barbearia')
  and (avatar='' or avatar ~ ('^'||user_id::text||'/[0-9a-f-]{36}$'))
  and (banner='' or banner ~ ('^'||user_id::text||'/[0-9a-f-]{36}$')));
create policy social_profiles_update on public.barberflow_social_profiles for update to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid() and (avatar='' or avatar ~ ('^'||user_id::text||'/[0-9a-f-]{36}$'))
  and (banner='' or banner ~ ('^'||user_id::text||'/[0-9a-f-]{36}$')));
create policy social_photos_read on public.barberflow_social_photos for select to authenticated
using (barberflow_private.social_photo_visible(id));
create policy social_photos_create on public.barberflow_social_photos for insert to authenticated
with check (author=auth.uid() and ((shop is null and barberflow_private.social_active(auth.uid())) or barberflow_private.social_owner(shop)));
create policy social_photos_update on public.barberflow_social_photos for update to authenticated
using (author=auth.uid() and (shop is null or barberflow_private.social_owner(shop)))
with check (author=auth.uid() and (shop is null or barberflow_private.social_owner(shop)));
create policy social_photos_delete on public.barberflow_social_photos for delete to authenticated
using (author=auth.uid());
create policy social_follow_users_read on public.barberflow_social_follow_users for select to authenticated
using (follower=auth.uid() or target=auth.uid());
create policy social_follow_users_create on public.barberflow_social_follow_users for insert to authenticated
with check (follower=auth.uid() and barberflow_private.social_active(follower) and barberflow_private.social_active(target));
create policy social_follow_users_delete on public.barberflow_social_follow_users for delete to authenticated using (follower=auth.uid());
create policy social_follow_shops_read on public.barberflow_social_follow_shops for select to authenticated using (follower=auth.uid());
create policy social_follow_shops_create on public.barberflow_social_follow_shops for insert to authenticated
with check (follower=auth.uid() and barberflow_private.social_active(follower) and barberflow_private.social_shop(shop));
create policy social_follow_shops_delete on public.barberflow_social_follow_shops for delete to authenticated using (follower=auth.uid());
create policy social_likes_read on public.barberflow_social_likes for select to authenticated using (barberflow_private.social_photo_visible(photo));
create policy social_likes_create on public.barberflow_social_likes for insert to authenticated
with check (actor=auth.uid() and barberflow_private.social_can_interact(photo));
create policy social_likes_delete on public.barberflow_social_likes for delete to authenticated using (actor=auth.uid());
create policy social_comments_read on public.barberflow_social_comments for select to authenticated
using (barberflow_private.social_photo_visible(photo) and (actor=auth.uid() or barberflow_private.social_active(actor)));
create policy social_comments_create on public.barberflow_social_comments for insert to authenticated
with check (actor=auth.uid() and barberflow_private.social_can_interact(photo)
  and (parent is null or barberflow_private.social_replyable(photo,parent)));
create policy social_comments_delete on public.barberflow_social_comments for delete to authenticated using (actor=auth.uid());
create policy deletion_read on public.barberflow_account_deletion_requests for select to authenticated using(user_id=auth.uid());
create policy deletion_create on public.barberflow_account_deletion_requests for insert to authenticated
with check(user_id=auth.uid() and public.barberflow_account_kind()='cliente');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('barberflow-social','barberflow-social',false,2097152,array['image/jpeg','image/png','image/webp','image/avif']);
create policy social_media_own_insert on storage.objects for insert to authenticated
with check(bucket_id='barberflow-social' and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}$'));
create policy social_media_own_delete on storage.objects for delete to authenticated
using(bucket_id='barberflow-social' and split_part(name,'/',1)=auth.uid()::text);
create policy social_media_read on storage.objects for select to authenticated
using(bucket_id='barberflow-social' and (split_part(name,'/',1)=auth.uid()::text
  or exists(select 1 from public.barberflow_social_profiles p where not p.frozen and name in(p.avatar,p.banner))
  or exists(select 1 from public.barberflow_social_photos p where p.object_path=name)));

create function public.barberflow_social_counts(profile uuid, shop_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when shop_id is not null and barberflow_private.social_shop(shop_id) then
    jsonb_build_object('followers',(select count(*) from public.barberflow_social_follow_shops f where f.shop=shop_id and barberflow_private.social_active(f.follower)))
  when profile is not null and (profile=auth.uid() or barberflow_private.social_active(profile)) then jsonb_build_object(
    'followers',(select count(*) from public.barberflow_social_follow_users f where f.target=profile and barberflow_private.social_active(f.follower)),
    'following',(select count(*) from public.barberflow_social_follow_users f where f.follower=profile and barberflow_private.social_active(f.target))+
      (select count(*) from public.barberflow_social_follow_shops f where f.follower=profile and barberflow_private.social_shop(f.shop)))
  end;
$$;
create function public.barberflow_my_service_counts() returns table(service_name text,visits bigint)
language sql stable security definer set search_path='' as $$
  select s.service_name,count(*) from public.barberflow_schedule s where s.booked_by=auth.uid()
    and s.kind='appointment' and s.state='completed' group by s.service_name order by count(*) desc,s.service_name limit 8;
$$;

revoke all on function public.barberflow_social_counts(uuid,uuid),public.barberflow_my_service_counts() from public,anon;
grant execute on function public.barberflow_social_counts(uuid,uuid),public.barberflow_my_service_counts() to authenticated;
alter table public.barberflow_reviews drop constraint barberflow_reviews_pkey,
  alter column appointment_id drop not null,
  add unique(appointment_id),
  add column reviewer uuid references auth.users(id) on delete set null;
alter table public.barberflow_reviews drop constraint barberflow_reviews_rating_check,
  add check(rating between 0 and 5);
create unique index barberflow_social_review_one on public.barberflow_reviews(establishment_id,reviewer)
where reviewer is not null;

create function public.barberflow_social_review(shop_id uuid, stars smallint, message text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.social_eligible(shop_id,true) or not barberflow_private.social_active(auth.uid())
    or not barberflow_private.social_shop(shop_id) or stars not between 0 and 5 then return false; end if;
  insert into public.barberflow_reviews(establishment_id,reviewer,rating,comment,author)
  select shop_id,p.user_id,stars,btrim(coalesce(message,'')),p.username
  from public.barberflow_social_profiles p where p.user_id=auth.uid()
  on conflict(establishment_id,reviewer) where reviewer is not null do nothing;
  return found;
end;
$$;
create function public.barberflow_social_shop_info(shop_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('name',e.name,'slug',e.slug,'can_review',barberflow_private.social_eligible(e.id,true)
    and not exists(select 1 from public.barberflow_reviews r where r.establishment_id=e.id and r.reviewer=auth.uid()))
  from public.barberflow_establishments e where e.id=shop_id and e.published and e.slug is not null;
$$;
create function public.barberflow_social_shop_by_slug(shop_slug text) returns uuid
language sql stable security definer set search_path='' as $$
  select id from public.barberflow_establishments where slug=shop_slug and published;
$$;
create function public.barberflow_social_feed(page_number integer) returns setof public.barberflow_social_photos
language sql stable security invoker set search_path='' as $$
  select p.* from public.barberflow_social_photos p
  where p.author=auth.uid() or exists(select 1 from public.barberflow_social_follow_users f where f.follower=auth.uid() and f.target=p.author and p.shop is null)
    or exists(select 1 from public.barberflow_social_follow_shops f where f.follower=auth.uid() and f.shop=p.shop)
  order by p.created_at desc,p.id limit 13 offset greatest(0,least(page_number,10000))*12;
$$;
create function public.barberflow_social_notices(page_number integer) returns table(kind text,photo uuid,occurred timestamptz,description text)
language sql stable security invoker set search_path='' as $$
  select n.* from (
    select 'Curtida'::text,l.photo,l.created_at,'Uma pessoa curtiu sua foto.'::text
    from public.barberflow_social_likes l join public.barberflow_social_photos p on p.id=l.photo
    where p.author=auth.uid() and l.actor<>auth.uid()
    union all
    select 'Comentário',c.photo,c.created_at,left(c.body,150)
    from public.barberflow_social_comments c join public.barberflow_social_photos p on p.id=c.photo
    left join public.barberflow_social_comments parent on parent.id=c.parent
    where (p.author=auth.uid() or parent.actor=auth.uid()) and c.actor<>auth.uid()
    union all
    select 'Promoção',p.id,p.created_at,p.caption from public.barberflow_social_photos p
    join public.barberflow_social_follow_shops f on f.shop=p.shop and f.follower=auth.uid() where p.promotion
  ) n order by 3 desc,2,1 limit 26 offset greatest(0,least(page_number,10000))*25;
$$;
revoke all on function public.barberflow_social_review(uuid,smallint,text),public.barberflow_social_shop_info(uuid),
  public.barberflow_social_shop_by_slug(text),public.barberflow_social_feed(integer),public.barberflow_social_notices(integer) from public,anon;
grant execute on function public.barberflow_social_review(uuid,smallint,text),public.barberflow_social_shop_info(uuid),
  public.barberflow_social_shop_by_slug(text),public.barberflow_social_feed(integer),public.barberflow_social_notices(integer) to authenticated;
create function public.barberflow_search_directory(search_text text, selected_segment text, page_number integer)
returns table(id uuid,slug text,name text,city text,segment text,logo text,cover text)
language sql stable security definer set search_path='' as $$
  select e.id,e.slug,e.name,e.city,e.segment,e.profile_details->>'logo',e.profile_details->>'cover'
  from public.barberflow_establishments e
  where e.published and e.slug is not null and (selected_segment='' or e.segment=selected_segment)
    and (search_text='' or strpos(lower(e.name||' '||coalesce(e.city,'')),lower(left(search_text,120)))>0
    or exists(select 1 from public.barberflow_services s where s.establishment_id=e.id and s.active and s.deleted_at is null
      and strpos(lower(s.name||' '||s.category),lower(left(search_text,120)))>0))
  order by e.name,e.slug limit 25 offset greatest(0,least(page_number,10000))*24;
$$;
revoke all on function public.barberflow_search_directory(text,text,integer) from public;
grant execute on function public.barberflow_search_directory(text,text,integer) to anon,authenticated;
create function public.barberflow_master_deletion_requests(page_number integer) returns table(user_id uuid,requested_at timestamptz,email text)
language sql stable security definer set search_path='' as $$
  select r.user_id,r.requested_at,u.email::text from public.barberflow_account_deletion_requests r
  join auth.users u on u.id=r.user_id where public.barberflow_is_master()
  order by r.requested_at desc,r.user_id limit 26 offset greatest(0,least(page_number,10000))*25;
$$;
revoke all on function public.barberflow_master_deletion_requests(integer) from public,anon;
grant execute on function public.barberflow_master_deletion_requests(integer) to authenticated;
create table public.barberflow_social_news (
  id uuid primary key default gen_random_uuid(),
  title text not null check(char_length(btrim(title)) between 1 and 120),
  body text not null check(char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.barberflow_social_news enable row level security;
revoke all on public.barberflow_social_news from public,anon,authenticated;
grant select,insert(title,body),delete on public.barberflow_social_news to authenticated;
create policy social_news_read on public.barberflow_social_news for select to authenticated using (true);
create policy social_news_create on public.barberflow_social_news for insert to authenticated
with check ((select public.barberflow_is_master()));
create policy social_news_remove on public.barberflow_social_news for delete to authenticated
using ((select public.barberflow_is_master()));

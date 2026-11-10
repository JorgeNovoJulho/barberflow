alter table public.barberflow_social_profiles add column revision integer not null default 0;

create function barberflow_private.social_profile_revision() returns trigger
language plpgsql set search_path='' as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
create trigger social_profile_revision before update on public.barberflow_social_profiles
for each row execute function barberflow_private.social_profile_revision();

create function public.barberflow_username_availability(candidate text) returns jsonb
language sql stable security definer set search_path='' as $$
  with input as (select btrim(candidate) as name where auth.uid() is not null and btrim(candidate) ~ '^[A-Za-z0-9_.-]{3,40}$'),
  free as (
    select n, left(name, 36)||'.'||n as suggestion from input cross join generate_series(2,999) n
    where not exists(select 1 from public.barberflow_social_profiles p where lower(p.username)=lower(left(name,36)||'.'||n))
    order by n limit 3
  )
  select jsonb_build_object('available',not exists(select 1 from public.barberflow_social_profiles p
    where lower(p.username)=lower(input.name) and p.user_id<>auth.uid()),
    'suggestions',coalesce((select jsonb_agg(suggestion order by n) from free),'[]'))
  from input;
$$;

create table public.barberflow_social_favorite_shops (
  follower uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shop uuid not null references public.barberflow_establishments(id) on delete cascade,
  primary key(follower,shop)
);
alter table public.barberflow_social_favorite_shops enable row level security;
revoke all on public.barberflow_social_favorite_shops from public,anon,authenticated;
grant select,insert(shop),delete on public.barberflow_social_favorite_shops to authenticated;
create policy social_favorites_read on public.barberflow_social_favorite_shops for select to authenticated using(follower=auth.uid());
create policy social_favorites_create on public.barberflow_social_favorite_shops for insert to authenticated
with check(follower=auth.uid() and barberflow_private.social_active(follower) and barberflow_private.social_shop(shop));
create policy social_favorites_delete on public.barberflow_social_favorite_shops for delete to authenticated using(follower=auth.uid());

create table barberflow_private.social_blocks (
  actor uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  primary key(actor,target), check(actor<>target)
);

create function barberflow_private.social_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from barberflow_private.social_blocks s
    where (s.actor=a and s.target=b) or (s.actor=b and s.target=a));
$$;
revoke all on function barberflow_private.social_blocked(uuid,uuid) from public,anon,authenticated;
create function barberflow_private.social_visible_to_me(subject uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not barberflow_private.social_blocked(auth.uid(),subject);
$$;
revoke all on function barberflow_private.social_visible_to_me(uuid) from public,anon;
grant execute on function barberflow_private.social_visible_to_me(uuid) to authenticated;

create policy social_profiles_block on public.barberflow_social_profiles as restrictive for select to authenticated
using (barberflow_private.social_visible_to_me(user_id));
create policy social_photos_block on public.barberflow_social_photos as restrictive for select to authenticated
using (barberflow_private.social_visible_to_me(author));
create policy social_comments_block on public.barberflow_social_comments as restrictive for select to authenticated
using (barberflow_private.social_visible_to_me(actor));

-- Serialize a block and new interactions between the same two accounts.
create function barberflow_private.social_pair_lock(a uuid,b uuid) returns void
language sql set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended(least(a,b)::text||greatest(a,b)::text, 17));
$$;
create function barberflow_private.social_guard_interaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor_id uuid; peer uuid; parent_actor uuid;
begin
  if tg_table_name='barberflow_social_follow_users' then
    actor_id:=new.follower;
    peer:=new.target;
  else
    actor_id:=new.actor;
    select author into peer from public.barberflow_social_photos where id=new.photo;
    if tg_table_name='barberflow_social_comments' then
      select actor into parent_actor from public.barberflow_social_comments where id=new.parent and photo=new.photo;
    end if;
  end if;
  if peer is not null then
    if parent_actor is not null and parent_actor<peer then
      perform barberflow_private.social_pair_lock(actor_id,parent_actor);
    end if;
    perform barberflow_private.social_pair_lock(actor_id,peer);
    if parent_actor is not null and parent_actor>peer then
      perform barberflow_private.social_pair_lock(actor_id,parent_actor);
    end if;
    if barberflow_private.social_blocked(actor_id,peer) or barberflow_private.social_blocked(actor_id,parent_actor) then
      raise exception 'Interaction blocked' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger social_follow_guard before insert on public.barberflow_social_follow_users
for each row execute function barberflow_private.social_guard_interaction();
create trigger social_like_guard before insert on public.barberflow_social_likes
for each row execute function barberflow_private.social_guard_interaction();
create trigger social_comment_guard before insert on public.barberflow_social_comments
for each row execute function barberflow_private.social_guard_interaction();

create function public.barberflow_block_profile(subject uuid, blocked boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid();
begin
  if viewer is null or subject is null or viewer=subject or blocked is null then return false; end if;
  perform barberflow_private.social_pair_lock(viewer,subject);
  if not blocked then
    delete from barberflow_private.social_blocks where actor=viewer and target=subject;
    return true;
  end if;
  if not barberflow_private.social_active(subject) or barberflow_private.social_blocked(viewer,subject) then return false; end if;
  insert into barberflow_private.social_blocks values(viewer,subject) on conflict do nothing;
  delete from public.barberflow_social_follow_users where (follower=viewer and target=subject) or (follower=subject and target=viewer);
  return true;
end;
$$;

create function public.barberflow_social_connections(profile uuid, direction text, page_number integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with visible as (
    select p.user_id,p.username,p.avatar from public.barberflow_social_follow_users f
    join public.barberflow_social_profiles p on p.user_id=case when direction='following' then f.target else f.follower end
    where (direction='following' and f.follower=profile or direction='followers' and f.target=profile)
      and not p.frozen and not barberflow_private.social_blocked(auth.uid(),p.user_id)
  )
  select jsonb_build_object('count',(select count(*) from visible),'rows',coalesce((
    select jsonb_agg(to_jsonb(p) order by p.username,p.user_id) from (
      select * from visible order by username,user_id limit 13 offset least(10000,greatest(0,page_number))*12
    ) p),'[]'))
  where auth.uid() is not null and not barberflow_private.social_blocked(auth.uid(),profile)
    and (profile=auth.uid() or barberflow_private.social_active(profile));
$$;

create function public.barberflow_saved_shops(collection text, page_number integer)
returns table(id uuid,slug text,name text,city text,logo text)
language sql stable security definer set search_path='' as $$
  select e.id,e.slug,e.name,e.city,e.profile_details->>'logo'
  from public.barberflow_establishments e join (
    select f.shop from public.barberflow_social_follow_shops f where collection='following' and f.follower=auth.uid()
    union all
    select f.shop from public.barberflow_social_favorite_shops f where collection='favorites' and f.follower=auth.uid()
  ) saved on saved.shop=e.id
  where e.published and e.slug is not null
  order by e.name,e.id limit 13 offset least(10000,greatest(0,page_number))*12;
$$;

create function public.barberflow_profile_presence(profile uuid, shop_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  with subject as (
    select profile as id where shop_id is null and (profile=auth.uid() or barberflow_private.social_active(profile))
    union all
    select e.owner_id from public.barberflow_establishments e where e.id=shop_id and barberflow_private.social_shop(shop_id)
  )
  select jsonb_build_object('online',coalesce(a.seen_at>now()-interval '150 seconds',false),'lastSeen',a.seen_at)
  from subject s left join barberflow_private.account_activity a on a.user_id=s.id
  where auth.uid() is not null and not barberflow_private.social_blocked(auth.uid(),s.id);
$$;

revoke all on function public.barberflow_username_availability(text),public.barberflow_block_profile(uuid,boolean),
  public.barberflow_social_connections(uuid,text,integer),public.barberflow_saved_shops(text,integer),public.barberflow_profile_presence(uuid,uuid)
  from public,anon;
grant execute on function public.barberflow_username_availability(text),public.barberflow_block_profile(uuid,boolean),
  public.barberflow_social_connections(uuid,text,integer),public.barberflow_saved_shops(text,integer),public.barberflow_profile_presence(uuid,uuid)
  to authenticated;
insert into public.barberflow_social_favorite_shops(follower,shop)
select follower,shop from public.barberflow_social_follow_shops on conflict do nothing;

create policy social_likes_block on public.barberflow_social_likes as restrictive for select to authenticated
using (barberflow_private.social_visible_to_me(actor));

create function public.barberflow_blocked_profiles(page_number integer)
returns table(user_id uuid, username text)
language sql stable security definer set search_path='' as $$
  select b.target,coalesce(p.username,'Perfil indisponível')
  from barberflow_private.social_blocks b left join public.barberflow_social_profiles p on p.user_id=b.target
  where b.actor=auth.uid()
  order by b.target limit 13 offset least(10000,greatest(0,page_number))*12;
$$;
revoke all on function public.barberflow_blocked_profiles(integer) from public,anon;
grant execute on function public.barberflow_blocked_profiles(integer) to authenticated;
create function barberflow_private.social_can_save_shop() returns boolean
language sql stable security definer set search_path='' as $$
  select public.barberflow_account_kind() in ('cliente','barbearia')
    and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false) and coalesce(u.banned_until,'-infinity')<=now())
    and not exists(select 1 from public.barberflow_social_profiles p where p.user_id=auth.uid() and p.frozen);
$$;
revoke all on function barberflow_private.social_can_save_shop() from public,anon;
grant execute on function barberflow_private.social_can_save_shop() to authenticated;
alter policy social_follow_shops_create on public.barberflow_social_follow_shops
with check(follower=auth.uid() and barberflow_private.social_can_save_shop() and barberflow_private.social_shop(shop));
alter policy social_favorites_create on public.barberflow_social_favorite_shops
with check(follower=auth.uid() and barberflow_private.social_can_save_shop() and barberflow_private.social_shop(shop));

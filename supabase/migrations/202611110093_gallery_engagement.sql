begin;
create table public.barberflow_feed_votes (
  post uuid not null references public.barberflow_social_photos(id) on delete cascade,
  comment uuid references public.barberflow_social_comments(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check(vote in (-1,1)),
  unique nulls not distinct(post,comment,actor)
);
create table public.barberflow_feed_comment_reports (
  comment uuid not null references public.barberflow_social_comments(id) on delete cascade,
  actor uuid not null references auth.users(id) on delete cascade,
  reason text not null check(char_length(btrim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  primary key(comment,actor)
);
alter table public.barberflow_feed_votes enable row level security;
alter table public.barberflow_feed_comment_reports enable row level security;
grant select on public.barberflow_feed_comment_reports to authenticated;
create policy master_feed_reports on public.barberflow_feed_comment_reports for select to authenticated
using((select public.barberflow_is_master()));

create function public.barberflow_gallery_feed(post_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'likes',(select count(*) from public.barberflow_social_likes where photo=post_id),
  'dislikes',(select count(*) from public.barberflow_feed_votes where post=post_id and comment is null and vote=-1),
  'vote',coalesce((select vote from public.barberflow_feed_votes where post=post_id and comment is null and actor=auth.uid()),
    (select 1 from public.barberflow_social_likes where photo=post_id and actor=auth.uid()),0),
  'comments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (
    select c.id,c.parent,c.body,c.created_at,coalesce(s.username,public.barberflow_engagement_business_name(c.actor),'Conta TOP BARBER') as name,
      s.avatar,
      (select count(*) from public.barberflow_feed_votes v where v.post=post_id and v.comment=c.id and v.vote=1) as likes,
      (select count(*) from public.barberflow_feed_votes v where v.post=post_id and v.comment=c.id and v.vote=-1) as dislikes,
      coalesce((select vote from public.barberflow_feed_votes v where v.post=post_id and v.comment=c.id and v.actor=auth.uid()),0) as vote
    from public.barberflow_social_comments c
    left join public.barberflow_social_profiles s on s.user_id=c.actor and not s.frozen
    where c.photo=post_id and not barberflow_private.social_blocked(auth.uid(),c.actor)
      and (c.actor=auth.uid() or barberflow_private.social_engagement_actor(c.actor))
    order by c.created_at desc,c.id limit 100
  ) x),'[]'::jsonb))
where auth.uid() is not null and barberflow_private.social_photo_visible(post_id)
  and exists(select 1 from public.barberflow_social_photos p where p.id=post_id
    and not barberflow_private.social_blocked(auth.uid(),p.author));
$$;

create or replace function barberflow_private.social_replyable(photo_id uuid, comment_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_social_comments c where c.photo=photo_id and c.id=comment_id
    and c.parent is null and barberflow_private.social_engagement_actor(c.actor));
$$;

create function public.barberflow_gallery_vote(post_id uuid, comment_id uuid, direction smallint) returns boolean
language plpgsql security definer set search_path='' as $$
declare peer uuid; current_vote smallint;
begin
  if direction is null or direction not in (-1,1) or not barberflow_private.social_can_interact(post_id)
    or exists(select 1 from public.barberflow_social_photos p where p.id=post_id
      and barberflow_private.social_blocked(auth.uid(),p.author)) then return false; end if;
  if comment_id is null then
    select author into peer from public.barberflow_social_photos where id=post_id;
  else
    select actor into peer from public.barberflow_social_comments where id=comment_id and photo=post_id
      and barberflow_private.social_engagement_actor(actor);
  end if;
  if peer is null or barberflow_private.social_blocked(auth.uid(),peer) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(post_id::text||coalesce(comment_id::text,'')||auth.uid()::text, 716));
  select vote into current_vote from public.barberflow_feed_votes
    where post=post_id and comment is not distinct from comment_id and actor=auth.uid();
  if comment_id is null and exists(select 1 from public.barberflow_social_likes where photo=post_id and actor=auth.uid()) then
    current_vote:=1;
  end if;
  delete from public.barberflow_feed_votes where post=post_id and comment is not distinct from comment_id and actor=auth.uid();
  if comment_id is null then
    delete from public.barberflow_social_likes where photo=post_id and actor=auth.uid();
  end if;
  if current_vote is distinct from direction then
    if comment_id is null and direction=1 then
      insert into public.barberflow_social_likes(photo,actor) values(post_id,auth.uid()) on conflict do nothing;
    else
      insert into public.barberflow_feed_votes(post,comment,actor,vote) values(post_id,comment_id,auth.uid(),direction);
    end if;
  end if;
  return true;
end;
$$;

create function barberflow_private.clear_negative_post_vote() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.photo::text||new.actor::text,716));
  delete from public.barberflow_feed_votes where post=new.photo and comment is null and actor=new.actor;
  return new;
end;
$$;
revoke all on function barberflow_private.clear_negative_post_vote() from public,anon,authenticated;
create trigger clear_negative_post_vote before insert on public.barberflow_social_likes
for each row execute function barberflow_private.clear_negative_post_vote();

create function public.barberflow_report_feed_comment(comment_id uuid, report_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(char_length(btrim(report_reason)),0) not between 3 and 500
    or not exists(select 1 from public.barberflow_social_comments c where c.id=comment_id and c.actor<>auth.uid()
      and barberflow_private.social_photo_visible(c.photo) and not barberflow_private.social_blocked(auth.uid(),c.actor)) then return false; end if;
  insert into public.barberflow_feed_comment_reports(comment,actor,reason) values(comment_id,auth.uid(),btrim(report_reason))
    on conflict do nothing;
  return true;
end;
$$;

create function public.barberflow_feed_comment_queue() returns table(id uuid,post uuid,body text,reasons text[])
language sql stable security definer set search_path='' as $$
  select c.id,c.photo,c.body,array_agg(r.reason order by r.created_at desc)
  from public.barberflow_feed_comment_reports r join public.barberflow_social_comments c on c.id=r.comment
  where public.barberflow_is_master()
  group by c.id order by max(r.created_at) desc limit 100;
$$;
create function public.barberflow_moderate_feed_comment(comment_id uuid, remove_comment boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_is_master() or remove_comment is null then return false; end if;
  if remove_comment then
    delete from public.barberflow_social_comments c where c.id=comment_id
      and exists(select 1 from public.barberflow_feed_comment_reports r where r.comment=c.id);
  else
    delete from public.barberflow_feed_comment_reports where comment=comment_id;
  end if;
  return found;
end;
$$;
revoke all on function public.barberflow_gallery_feed(uuid),public.barberflow_gallery_vote(uuid,uuid,smallint),
 public.barberflow_report_feed_comment(uuid,text),public.barberflow_feed_comment_queue(),
 public.barberflow_moderate_feed_comment(uuid,boolean) from public,anon;
grant execute on function public.barberflow_gallery_feed(uuid),public.barberflow_gallery_vote(uuid,uuid,smallint),
 public.barberflow_report_feed_comment(uuid,text),public.barberflow_feed_comment_queue(),
 public.barberflow_moderate_feed_comment(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;

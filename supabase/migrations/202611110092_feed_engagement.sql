begin;
alter table public.barberflow_social_likes drop constraint barberflow_social_likes_actor_fkey,
  add constraint barberflow_social_likes_actor_fkey foreign key(actor) references auth.users(id) on delete cascade;
alter table public.barberflow_social_comments drop constraint barberflow_social_comments_actor_fkey,
  add constraint barberflow_social_comments_actor_fkey foreign key(actor) references auth.users(id) on delete cascade;

create function barberflow_private.social_engagement_actor(subject uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select barberflow_private.social_active(subject) or (
    exists(select 1 from public.barberflow_establishments e where e.owner_id=subject)
    and not exists(select 1 from public.barberflow_social_profiles s where s.user_id=subject and s.frozen)
  );
$$;
revoke all on function barberflow_private.social_engagement_actor(uuid) from public,anon;
grant execute on function barberflow_private.social_engagement_actor(uuid) to authenticated;

create or replace function barberflow_private.social_can_interact(photo_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select barberflow_private.social_can_save_shop()
    and barberflow_private.social_engagement_actor(auth.uid())
    and barberflow_private.social_photo_visible(photo_id);
$$;

alter policy social_comments_read on public.barberflow_social_comments
using (barberflow_private.social_photo_visible(photo) and
  (actor=auth.uid() or barberflow_private.social_engagement_actor(actor)));

create function public.barberflow_engagement_business_name(subject uuid) returns text
language sql stable security definer set search_path='' as $$
  select e.name from public.barberflow_establishments e
  where auth.uid() is not null and e.owner_id=subject and e.published
    and not barberflow_private.social_blocked(auth.uid(),subject)
  order by e.id limit 1;
$$;
revoke all on function public.barberflow_engagement_business_name(uuid) from public,anon;
grant execute on function public.barberflow_engagement_business_name(uuid) to authenticated;

create or replace function public.barberflow_feed_engagement(post_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id,jsonb_build_object(
    'likes',(select count(*) from public.barberflow_social_likes l where l.photo=p.id),
    'liked',exists(select 1 from public.barberflow_social_likes l where l.photo=p.id and l.actor=auth.uid()),
    'comments',(select count(*) from public.barberflow_social_comments c where c.photo=p.id),
    'people',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.actor as id,coalesce(s.username,public.barberflow_engagement_business_name(l.actor),'Conta TOP BARBER') as name
      from public.barberflow_social_likes l left join public.barberflow_social_profiles s on s.user_id=l.actor
      where l.photo=p.id order by l.created_at desc,l.actor limit 5
    ) x),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.id,c.body,coalesce(s.username,public.barberflow_engagement_business_name(c.actor),'Conta TOP BARBER') as name
      from public.barberflow_social_comments c left join public.barberflow_social_profiles s on s.user_id=c.actor
      where c.photo=p.id order by c.created_at desc,c.id limit 5
    ) x),'[]'::jsonb)
  )), '{}'::jsonb)
  from public.barberflow_social_photos p
  where auth.uid() is not null and cardinality(post_ids)<=12 and p.id=any(post_ids);
$$;
revoke all on function public.barberflow_feed_engagement(uuid[]) from public,anon;
grant execute on function public.barberflow_feed_engagement(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;

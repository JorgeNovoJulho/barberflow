begin;
create or replace function public.barberflow_gallery_feed(post_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object(
  'likes',(select count(*) from public.barberflow_social_likes where photo=post_id),
  'dislikes',(select count(*) from public.barberflow_feed_votes where post=post_id and comment is null and vote=-1),
  'vote',coalesce((select vote from public.barberflow_feed_votes where post=post_id and comment is null and actor=auth.uid()),
    (select 1 from public.barberflow_social_likes where photo=post_id and actor=auth.uid()),0),
  'comments',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from (
    select c.id,c.parent,c.body,c.created_at,coalesce(s.username,public.barberflow_engagement_business_name(c.actor),'Conta TOP BARBER') as name,
      s.avatar, (select e.profile_details->>'logo' from public.barberflow_establishments e
        where e.owner_id=c.actor and (e.published or e.owner_id=auth.uid())
          and nullif(e.profile_details->>'logo','') is not null
        order by (e.id=(select p.shop from public.barberflow_social_photos p where p.id=post_id)) desc nulls last,e.id
        limit 1) as logo,
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

create function public.barberflow_feed_shop_names(post_ids uuid[])
returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
  select distinct e.id,e.name
  from public.barberflow_social_photos p join public.barberflow_establishments e on e.id=p.shop
  where auth.uid() is not null and cardinality(post_ids)<=12 and p.id=any(post_ids)
    and barberflow_private.social_photo_visible(p.id)
    and not barberflow_private.social_blocked(auth.uid(),p.author);
$$;
revoke all on function public.barberflow_feed_shop_names(uuid[]) from public,anon;
grant execute on function public.barberflow_feed_shop_names(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;

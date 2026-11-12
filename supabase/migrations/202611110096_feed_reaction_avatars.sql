begin;
create or replace function public.barberflow_feed_engagement(post_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id,jsonb_build_object(
    'likes',(select count(*) from public.barberflow_social_likes l where l.photo=p.id),
    'liked',exists(select 1 from public.barberflow_social_likes l where l.photo=p.id and l.actor=auth.uid()),
    'comments',(select count(*) from public.barberflow_social_comments c where c.photo=p.id),
    'people',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.actor as id,coalesce(s.username,public.barberflow_engagement_business_name(l.actor),'Conta TOP BARBER') as name,s.avatar
      from public.barberflow_social_likes l left join public.barberflow_social_profiles s on s.user_id=l.actor
      where l.photo=p.id order by l.created_at desc,l.actor limit 5
    ) x),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.id,c.body,coalesce(s.username,public.barberflow_engagement_business_name(c.actor),'Conta TOP BARBER') as name,s.avatar
      from public.barberflow_social_comments c left join public.barberflow_social_profiles s on s.user_id=c.actor
      where c.photo=p.id order by c.created_at desc,c.id limit 5
    ) x),'[]'::jsonb)
  )), '{}'::jsonb)
  from public.barberflow_social_photos p
  where auth.uid() is not null and cardinality(post_ids)<=12 and p.id=any(post_ids);
$$;
notify pgrst, 'reload schema';
commit;

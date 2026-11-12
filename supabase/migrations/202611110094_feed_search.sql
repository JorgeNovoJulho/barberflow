begin;
create function public.barberflow_feed_search(search_text text, page_number integer)
returns table(id uuid, kind text, name text, image text, account_type text, followers bigint, following bigint, online boolean, last_seen timestamptz)
language sql stable security definer set search_path='' as $$
  with candidates as (
    select p.user_id as id,p.user_id as actor,'person'::text as kind,p.username as name,p.avatar as image
    from public.barberflow_social_profiles p
    where not p.frozen and p.user_id<>auth.uid()
    union all
    select e.id,e.owner_id,'shop',e.name,e.profile_details->>'logo'
    from public.barberflow_establishments e
    where e.published and e.slug is not null
  ), matched as (
    select c.* from candidates c
    where auth.uid() is not null and not barberflow_private.social_blocked(auth.uid(),c.actor)
      and strpos(lower(c.name), lower(left(ltrim(btrim(coalesce(search_text,'')),'@'),120)))>0
    order by lower(c.name),c.kind,c.id
    limit 13 offset greatest(0,least(coalesce(page_number,0),10000))*12
  )
  select m.id,m.kind,m.name,m.image,
    case when m.kind='shop' or r.kind='barbearia' then 'Estabelecimento' else 'Cliente' end,
    case when m.kind='shop' then
      (select count(*) from public.barberflow_social_follow_shops f where f.shop=m.id
        and barberflow_private.social_engagement_actor(f.follower))
    else (select count(*) from public.barberflow_social_follow_users f where f.target=m.id
        and barberflow_private.social_engagement_actor(f.follower)) end,
    (select count(*) from public.barberflow_social_follow_users f where f.follower=m.actor
      and barberflow_private.social_active(f.target)) +
    (select count(*) from public.barberflow_social_follow_shops f where f.follower=m.actor
      and barberflow_private.social_shop(f.shop)),
    coalesce(a.seen_at>now()-interval '150 seconds',false),a.seen_at
  from matched m left join barberflow_private.account_activity a on a.user_id=m.actor
  left join barberflow_private.account_roles r on r.user_id=m.actor
  order by lower(m.name),m.kind,m.id;
$$;

create function public.barberflow_own_feed_counts(shop_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'followers',(select count(*) from public.barberflow_social_follow_shops f where f.shop=e.id
      and barberflow_private.social_engagement_actor(f.follower)),
    'following',(select count(*) from public.barberflow_social_follow_users f where f.follower=e.owner_id
      and barberflow_private.social_active(f.target))+
      (select count(*) from public.barberflow_social_follow_shops f where f.follower=e.owner_id
      and barberflow_private.social_shop(f.shop))
  ) from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid();
$$;
revoke all on function public.barberflow_feed_search(text,integer),public.barberflow_own_feed_counts(uuid) from public,anon;
grant execute on function public.barberflow_feed_search(text,integer),public.barberflow_own_feed_counts(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

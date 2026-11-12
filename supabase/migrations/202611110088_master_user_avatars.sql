begin;
create or replace function public.barberflow_master_users(search_text text, page_index integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with users as (
    select u.id,u.email,p.avatar,left(u.raw_user_meta_data->>'full_name',120) as name,
      u.raw_user_meta_data->>'account_intent' as intent,u.created_at,u.email_confirmed_at,u.last_sign_in_at,u.banned_until,
      a.seen_at,coalesce(a.seen_at>now()-interval '3 minutes',false) as online,
      (select count(*) from public.barberflow_establishments e where e.owner_id=u.id) as businesses
    from auth.users u left join barberflow_private.account_activity a on a.user_id=u.id
    left join public.barberflow_social_profiles p on p.user_id=u.id
    where public.barberflow_is_master()
  ), filtered as (
    select * from users where strpos(lower(concat(email,' ',name)),lower(left(coalesce(search_text,''),120)))>0
      or coalesce(search_text,'')=''
  )
  select jsonb_build_object(
    'total',(select count(*) from users),
    'confirmed',(select count(email_confirmed_at) from users),
    'online',(select count(*) from users where online),
    'filtered',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
      select * from filtered order by created_at desc,id limit 25 offset greatest(0,least(page_index,100000))*25
    ) r),'[]'::jsonb)
  ) where public.barberflow_is_master();
$$;

create function public.barberflow_master_can_read_avatar(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.barberflow_is_master() and exists(
    select 1 from public.barberflow_social_profiles p
    where p.user_id::text=split_part(object_name,'/',1) and p.avatar=object_name
  );
$$;
revoke all on function public.barberflow_master_can_read_avatar(text) from public,anon;
grant execute on function public.barberflow_master_can_read_avatar(text) to authenticated;

create policy master_account_avatar_read on storage.objects for select to authenticated
  using(bucket_id='barberflow-social' and public.barberflow_master_can_read_avatar(name));

notify pgrst, 'reload schema';
commit;

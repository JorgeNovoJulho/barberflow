begin;
alter policy social_follow_users_create on public.barberflow_social_follow_users
with check (
  follower=(select auth.uid())
  and barberflow_private.social_active(target)
  and (
    barberflow_private.social_active(follower)
    or (barberflow_private.social_can_save_shop() and exists (
      select 1 from public.barberflow_establishments e where e.owner_id=(select auth.uid())
    ))
  )
);
commit;

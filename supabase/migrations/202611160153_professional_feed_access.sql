alter table barberflow_private.team_access add column manage_feed boolean not null default false;

create function public.barberflow_can_manage_shop_feed(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select shop is not null and public.barberflow_shop_access_state(shop) = 'normal'
    and (barberflow_private.social_owner(shop) or exists (
      select 1 from barberflow_private.team_access t
      where t.establishment_id=shop and t.user_id=auth.uid()
        and t.accepted_at is not null and t.revoked_at is null and t.manage_feed
        and t.professional_id=barberflow_private.individual_professional(shop)
    ));
$$;
revoke all on function public.barberflow_can_manage_shop_feed(uuid) from public,anon;
grant execute on function public.barberflow_can_manage_shop_feed(uuid) to authenticated;

alter policy social_photos_create on public.barberflow_social_photos
with check (author=auth.uid() and ((shop is null and barberflow_private.social_active(auth.uid()))
  or public.barberflow_can_manage_shop_feed(shop)));
alter policy social_photos_update on public.barberflow_social_photos
using ((shop is null and author=auth.uid()) or public.barberflow_can_manage_shop_feed(shop))
with check ((shop is null and author=auth.uid()) or public.barberflow_can_manage_shop_feed(shop));
alter policy social_photos_delete on public.barberflow_social_photos
using ((shop is null and author=auth.uid()) or public.barberflow_can_manage_shop_feed(shop));
alter policy social_photos_read on public.barberflow_social_photos
using (barberflow_private.social_photo_visible(id) or public.barberflow_can_manage_shop_feed(shop));
alter policy social_photos_block on public.barberflow_social_photos
using (barberflow_private.social_visible_to_me(author) or public.barberflow_can_manage_shop_feed(shop));

create function public.barberflow_shop_feed_totals(shop uuid)
returns table(comments bigint, likes bigint) language sql stable security definer set search_path='' as $$
  select
    (select count(*) from public.barberflow_social_comments c join public.barberflow_social_photos p on p.id=c.photo where p.shop=$1),
    (select count(*) from public.barberflow_social_likes l join public.barberflow_social_photos p on p.id=l.photo where p.shop=$1)
  where public.barberflow_can_manage_shop_feed(shop);
$$;
revoke all on function public.barberflow_shop_feed_totals(uuid) from public,anon;
grant execute on function public.barberflow_shop_feed_totals(uuid) to authenticated;
create function public.barberflow_team_members_with_feed(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,manage_clients boolean,manage_services boolean,manage_professionals boolean,read_finance boolean,expires_at timestamptz,accepted_at timestamptz,manage_products boolean, manage_feed boolean)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.manage_clients,t.manage_services,t.manage_professionals,t.read_finance,t.expires_at,t.accepted_at,t.manage_products,t.manage_feed
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;
revoke all on function public.barberflow_team_members_with_feed(uuid) from public,anon;
grant execute on function public.barberflow_team_members_with_feed(uuid) to authenticated;

create function public.barberflow_update_team_permissions_with_feed(shop uuid, person uuid, member uuid,
  see_agendas boolean, manage_agendas boolean, edit_clients boolean, edit_services boolean,
  edit_professionals boolean, view_finance boolean, edit_products boolean, edit_feed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update barberflow_private.team_access t
    set see_all=coalesce(see_agendas,false) or coalesce(manage_agendas,false),
        manage_all=coalesce(manage_agendas,false),
        manage_clients=coalesce(edit_clients,false),
        manage_services=coalesce(edit_services,false),
        manage_professionals=coalesce(edit_professionals,false),
        read_finance=coalesce(view_finance,false),
        manage_products=coalesce(edit_products,false),
        manage_feed=coalesce(edit_feed,false)
  where t.id=member and t.establishment_id=shop and t.professional_id=person
    and t.accepted_at is not null and t.revoked_at is null and t.user_id is not null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid());
  if not found then return false; end if;
  if view_finance is not true then
    delete from barberflow_private.team_finance_sessions s where s.member_id=member;
  end if;
  return true;
end;
$$;
revoke all on function public.barberflow_update_team_permissions_with_feed(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.barberflow_update_team_permissions_with_feed(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

notify pgrst, 'reload schema';

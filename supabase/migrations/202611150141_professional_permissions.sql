create function public.barberflow_update_team_permissions(shop uuid, person uuid, member uuid,
  see_agendas boolean, manage_agendas boolean, edit_clients boolean, edit_services boolean,
  edit_professionals boolean, view_finance boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update barberflow_private.team_access t
    set see_all=coalesce(see_agendas,false) or coalesce(manage_agendas,false),
        manage_all=coalesce(manage_agendas,false),
        manage_clients=coalesce(edit_clients,false),
        manage_services=coalesce(edit_services,false),
        manage_professionals=coalesce(edit_professionals,false),
        read_finance=coalesce(view_finance,false)
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
revoke all on function public.barberflow_update_team_permissions(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.barberflow_update_team_permissions(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
create function public.barberflow_professional_team_agenda_access(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from barberflow_private.team_access t
    where t.establishment_id=shop and t.user_id=auth.uid()
      and t.accepted_at is not null and t.revoked_at is null and (t.see_all or t.manage_all)
      and t.professional_id=barberflow_private.individual_professional(shop));
$$;
revoke all on function public.barberflow_professional_team_agenda_access(uuid) from public,anon;
grant execute on function public.barberflow_professional_team_agenda_access(uuid) to authenticated;

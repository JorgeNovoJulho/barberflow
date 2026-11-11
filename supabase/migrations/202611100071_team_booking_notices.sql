create function public.barberflow_team_booking_notifications(shop uuid)
returns table(id uuid,client_name text,service_name text,starts_at timestamp)
language sql stable security definer set search_path='' as $$
  select a.id,a.client_name,a.service_name,a.starts_at from public.barberflow_schedule a
  where a.establishment_id=shop and (a.guest_online or a.booked_by is not null)
    and a.state in ('pending','scheduled') and a.booking_created_at>=now()-interval '24 hours'
    and exists(select 1 from barberflow_private.team_access t where t.establishment_id=shop
      and t.user_id=(select auth.uid()) and t.professional_id=a.professional_id
      and t.revoked_at is null and t.accepted_at is not null
      )
  order by a.booking_created_at desc,a.id limit 20;
$$;
revoke all on function public.barberflow_team_booking_notifications(uuid) from public,anon;
grant execute on function public.barberflow_team_booking_notifications(uuid) to authenticated;

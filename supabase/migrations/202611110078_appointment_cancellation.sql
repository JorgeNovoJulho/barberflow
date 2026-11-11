alter table public.barberflow_schedule add column cancellation_reason text
  check (cancellation_reason is null or char_length(btrim(cancellation_reason)) between 1 and 500);

create function public.barberflow_cancel_appointment(shop uuid, entry uuid, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if reason is null or char_length(btrim(reason)) not between 1 and 500 then return false; end if;
  perform 1 from public.barberflow_schedule s
    where s.id=entry and s.establishment_id=shop and s.kind='appointment'
      and (exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid())
        or barberflow_private.team_can_manage(shop,s.professional_id))
    for update;
  if not found or not public.barberflow_set_schedule_state(shop,entry,'cancelled') then return false; end if;
  update public.barberflow_schedule set cancellation_reason=btrim(reason) where id=entry and establishment_id=shop;
  return true;
end;
$$;

create function public.barberflow_my_cancellation_notices()
returns table(id uuid, shop_name text, service_name text, starts_at timestamp, reason text)
language sql stable security definer set search_path='' as $$
  select a.id,e.name,a.service_name,a.starts_at,a.cancellation_reason
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  where a.booked_by=auth.uid() and a.state='cancelled' and a.cancellation_reason is not null
  order by a.starts_at desc,a.id limit 100;
$$;

revoke all on function public.barberflow_cancel_appointment(uuid,uuid,text),public.barberflow_my_cancellation_notices() from public,anon;
grant execute on function public.barberflow_cancel_appointment(uuid,uuid,text),public.barberflow_my_cancellation_notices() to authenticated;
create or replace function public.barberflow_guest_confirmation(request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('state',a.state,'start',a.starts_at,'service',a.service_name,'professional',p.name,'shop',e.name,'slug',e.slug,'reason',a.cancellation_reason)
  from barberflow_private.guest_booking_requests g
  join public.barberflow_schedule a on a.id=g.booking_id
  join public.barberflow_establishments e on e.id=a.establishment_id
  join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=e.id
  where g.request_id=barberflow_guest_confirmation.request_id;
$$;

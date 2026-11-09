create function public.barberflow_reschedule(shop uuid, entry uuid, new_start timestamp)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  appointment record;
  workday record;
  new_end timestamp;
begin
  if not exists (select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then
    raise exception using errcode='42501', message='Establishment unavailable';
  end if;
  if new_start is null or not isfinite(new_start) then
    raise exception using errcode='22023', message='Invalid start';
  end if;
  select * into appointment from public.barberflow_schedule
    where establishment_id=shop and id=entry and kind='appointment' and state='scheduled' for update;
  if not found then return false; end if;
  perform 1 from public.barberflow_professionals
    where establishment_id=shop and id=appointment.professional_id and active for share;
  if not found then raise exception using errcode='22023', message='Professional unavailable'; end if;
  new_end := new_start + (appointment.ends_at - appointment.starts_at);
  select * into workday from public.barberflow_professional_hours
    where establishment_id=shop and professional_id=appointment.professional_id
      and weekday=extract(dow from new_start) for share;
  if not found or new_start::date <> new_end::date or new_start::time < workday.starts_at
    or new_end::time > workday.ends_at or (workday.break_start is not null
      and new_start::time < workday.break_end and new_end::time > workday.break_start) then
    raise exception using errcode='22023', message='Outside working hours';
  end if;
  update public.barberflow_schedule set starts_at=new_start, ends_at=new_end where id=entry and establishment_id=shop;
  return found;
end;
$$;
revoke all on function public.barberflow_reschedule(uuid,uuid,timestamp) from public,anon;
grant execute on function public.barberflow_reschedule(uuid,uuid,timestamp) to authenticated;

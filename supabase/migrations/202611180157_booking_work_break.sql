begin;
create function barberflow_private.service_finish(shop uuid, person uuid, start_at timestamp, duration integer)
returns timestamp language sql stable security definer set search_path='' as $$
  select start_at + make_interval(mins=>duration)
    + case when h.break_start is not null and start_at::time < h.break_start
        and start_at+make_interval(mins=>duration) > start_at::date+h.break_start
      then h.break_end-h.break_start else interval '0' end
  from barberflow_private.effective_professional_hours h
  where h.establishment_id=shop and h.professional_id=person and h.weekday=extract(dow from start_at);
$$;
revoke all on function barberflow_private.service_finish(uuid,uuid,timestamp,integer) from public,anon,authenticated;

alter table public.barberflow_schedule add column work_duration_minutes integer;
update public.barberflow_schedule set work_duration_minutes=(extract(epoch from ends_at-starts_at)/60)::integer where kind='appointment';
alter table public.barberflow_schedule add constraint schedule_work_duration check(work_duration_minutes is null or work_duration_minutes between 1 and 1440);

create function barberflow_private.snapshot_work_duration()
returns trigger language plpgsql security definer set search_path='' as $$
declare pause interval := interval '0';
begin
  if new.kind='appointment' and new.work_duration_minutes is null then
    select greatest(interval '0', least(new.ends_at,new.starts_at::date+h.break_end)-greatest(new.starts_at,new.starts_at::date+h.break_start))
    into pause from barberflow_private.effective_professional_hours h
    where h.establishment_id=new.establishment_id and h.professional_id=new.professional_id
      and h.weekday=extract(dow from new.starts_at) and h.break_start is not null;
    new.work_duration_minutes := (extract(epoch from new.ends_at-new.starts_at-coalesce(pause,interval '0'))/60)::integer;
  end if;
  return new;
end;
$$;
revoke all on function barberflow_private.snapshot_work_duration() from public,anon,authenticated;
create trigger snapshot_work_duration before insert on public.barberflow_schedule
for each row execute function barberflow_private.snapshot_work_duration();
CREATE OR REPLACE FUNCTION public.barberflow_reschedule(shop uuid, entry uuid, new_start timestamp without time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  appointment record;
  workday record;
  new_end timestamp;
begin
  if new_start is null or not isfinite(new_start) then
    raise exception using errcode='22023', message='Invalid start';
  end if;
  select * into appointment from public.barberflow_schedule
    where establishment_id=shop and id=entry and kind='appointment' and state='scheduled'
      and (barberflow_private.team_can_manage(shop,professional_id) or exists(select 1 from public.barberflow_establishments
        where id=shop and owner_id=(select auth.uid()))) for update;
  if not found then return false; end if;
  perform 1 from public.barberflow_professionals
    where establishment_id=shop and id=appointment.professional_id and active for share;
  if not found then raise exception using errcode='22023', message='Professional unavailable'; end if;
  new_end := barberflow_private.service_finish(shop,appointment.professional_id,new_start,coalesce(appointment.work_duration_minutes,(extract(epoch from appointment.ends_at-appointment.starts_at)/60)::integer));
  select * into workday from barberflow_private.effective_professional_hours
    where establishment_id=shop and professional_id=appointment.professional_id
      and weekday=extract(dow from new_start);
  if not found or new_start::date <> new_end::date or new_start::time < workday.starts_at
    or new_end::time > workday.ends_at or (workday.break_start is not null
      and new_start::time >= workday.break_start and new_start::time < workday.break_end) then
    raise exception using errcode='22023', message='Outside working hours';
  end if;
  update public.barberflow_schedule set starts_at=new_start, ends_at=new_end where id=entry and establishment_id=shop;
  return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_book_online(profile_slug text, professional uuid, service uuid, start_at timestamp without time zone, customer text, phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  buyer uuid := (select auth.uid());
  offering record;
  entry uuid;
begin
  if buyer is null or not exists (select 1 from auth.users where id=buyer and email_confirmed_at is not null) then
    raise exception using errcode='42501', message='Verified account required';
  end if;
  if customer is null or char_length(btrim(customer)) not between 1 and 120 or char_length(phone)>30
    or start_at is null or not isfinite(start_at) then
    raise exception using errcode='22023', message='Invalid booking';
  end if;
  select e.id as shop,e.auto_confirm,e.preparation_minutes,s.name,s.price_cents,s.duration_minutes into offering
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from start_at)
  where e.slug=profile_slug and e.published for share of e,p,s,ps,h;
  if not found or not exists (select 1 from barberflow_private.available_slots(profile_slug,professional,service,start_at::date) available where available.slot=start_at) then
    raise exception using errcode='22023', message='Slot unavailable';
  end if;
  insert into public.barberflow_schedule
    (establishment_id,professional_id,service_id,kind,state,starts_at,ends_at,service_name,price_cents,client_name,client_phone,booked_by,preparation_minutes)
  values (offering.shop,professional,service,'appointment',case when offering.auto_confirm then 'scheduled' else 'pending' end,
    start_at,barberflow_private.service_finish(offering.shop,professional,start_at,offering.duration_minutes),
    offering.name,offering.price_cents,btrim(customer),nullif(btrim(phone),''),buyer,offering.preparation_minutes)
  returning id into entry;
  return entry;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_customer_reschedule_slots(entry uuid, booking_day date)
 RETURNS TABLE(slot timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select slots.slot
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  cross join lateral barberflow_private.available_slots(e.slug,a.professional_id,a.service_id,booking_day,a.id,
    coalesce(a.work_duration_minutes,(extract(epoch from a.ends_at-a.starts_at)/60)::integer),a.preparation_minutes) slots
  where a.id=entry and a.booked_by=(select auth.uid()) and a.state in ('scheduled','pending')
    and e.allow_customer_reschedule and a.starts_at > (now() at time zone 'America/Sao_Paulo')
    and a.starts_at >= (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(hours=>e.change_notice_hours);
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_customer_booking_change(entry uuid, new_start timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  booking record;
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
  duration integer;
begin
  select a.*,e.slug,e.published,e.auto_confirm,e.allow_customer_cancel,e.allow_customer_reschedule,e.change_notice_hours
  into booking
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  where a.id=entry and a.booked_by=(select auth.uid()) and a.state in ('scheduled','pending')
  for update of a for share of e;
  if not found or booking.starts_at <= local_now
    or booking.starts_at < local_now+pg_catalog.make_interval(hours=>booking.change_notice_hours) then return false; end if;

  if new_start is null then
    if not booking.allow_customer_cancel then return false; end if;
    update public.barberflow_schedule set state='cancelled',customer_cancelled_at=now() where id=entry;
  else
    if not booking.allow_customer_reschedule or not booking.published or not isfinite(new_start) then return false; end if;
    perform 1 from public.barberflow_professionals p
      join public.barberflow_professional_services ps on ps.establishment_id=p.establishment_id and ps.professional_id=p.id
      join public.barberflow_services s on s.establishment_id=ps.establishment_id and s.id=ps.service_id and s.active
      join barberflow_private.effective_professional_hours h on h.establishment_id=p.establishment_id and h.professional_id=p.id
        and h.weekday=extract(dow from new_start)
      where p.establishment_id=booking.establishment_id and p.id=booking.professional_id and p.active and s.id=booking.service_id
      for share of p,ps,s,h;
    if not found then return false; end if;
    duration := coalesce(booking.work_duration_minutes,(extract(epoch from booking.ends_at-booking.starts_at)/60)::integer);
    if not exists (select 1 from barberflow_private.available_slots(booking.slug,booking.professional_id,booking.service_id,
      new_start::date,entry,duration,booking.preparation_minutes) slots where slots.slot=new_start) then return false; end if;
    update public.barberflow_schedule set starts_at=new_start,ends_at=barberflow_private.service_finish(booking.establishment_id,booking.professional_id,new_start,duration),
      state=case when booking.auto_confirm then 'scheduled' else 'pending' end where id=entry;
  end if;
  return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_create_schedule_entry(shop uuid, professional uuid, service uuid, start_at timestamp without time zone, block_end timestamp without time zone, customer text, phone text, note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  offering record;
  workday record;
  finish timestamp;
  entry_id uuid;
begin
  if not exists (select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid()))
    and (service is null or not barberflow_private.team_can_manage(shop,professional)) then
    raise exception using errcode='42501', message='Establishment unavailable';
  end if;
  perform 1 from public.barberflow_professionals where establishment_id=shop and id=professional and active for share;
  if not found then raise exception using errcode='22023', message='Professional unavailable'; end if;
  if service is null then
    if block_end is null or start_at >= block_end then raise exception using errcode='22023', message='Invalid block'; end if;
    insert into public.barberflow_schedule (establishment_id,professional_id,kind,starts_at,ends_at,notes)
      values (shop,professional,'block',start_at,block_end,coalesce(note,'')) returning id into entry_id;
  else
    select s.name,s.price_cents,s.duration_minutes into offering from public.barberflow_services s
      join public.barberflow_professional_services ps on ps.establishment_id=s.establishment_id and ps.service_id=s.id
      where s.establishment_id=shop and s.id=service and ps.professional_id=professional and s.active
      for share of s, ps;
    if not found then raise exception using errcode='22023', message='Service unavailable for professional'; end if;
    finish := barberflow_private.service_finish(shop,professional,start_at,offering.duration_minutes);
    select * into workday from barberflow_private.effective_professional_hours
      where establishment_id=shop and professional_id=professional and weekday=extract(dow from start_at);
    if not found or start_at::date <> finish::date or start_at::time < workday.starts_at
      or finish::time > workday.ends_at or (workday.break_start is not null
        and start_at::time >= workday.break_start and start_at::time < workday.break_end) then
      raise exception using errcode='22023', message='Outside working hours';
    end if;
    insert into public.barberflow_schedule
      (establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name,client_phone,notes)
      values (shop,professional,service,'appointment',start_at,finish,offering.name,offering.price_cents,
        btrim(customer),nullif(btrim(phone),''),coalesce(note,'')) returning id into entry_id;
  end if;
  return entry_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_book_guest(profile_slug text, professional uuid, service uuid, start_at timestamp without time zone, customer text, phone text, request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing record;
  offering record;
  entry uuid;
begin
  if request_id is null or phone is null or regexp_replace(phone,'[^0-9]','','g') !~ '^[0-9]{10,15}$' then
    raise exception using errcode='22023',message='Contact required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,700));
  select a.* into existing from barberflow_private.guest_booking_requests g
  join public.barberflow_schedule a on a.id=g.booking_id where g.request_id=barberflow_book_guest.request_id;
  if found then
    if existing.professional_id=professional and existing.service_id=service and existing.starts_at=start_at
      and existing.client_name=btrim(customer) and existing.client_phone=btrim(phone) then return existing.id; end if;
    raise exception using errcode='22023',message='Request changed';
  end if;
  if customer is null or char_length(btrim(customer)) not between 1 and 120 or char_length(phone)>30
    or start_at is null or not isfinite(start_at) then
    raise exception using errcode='22023', message='Invalid booking';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(regexp_replace(phone,'[^0-9]','','g'),701));
  if (select count(*) from public.barberflow_schedule a where a.guest_online
    and regexp_replace(a.client_phone,'[^0-9]','','g')=regexp_replace(phone,'[^0-9]','','g')
    and a.booking_created_at>now()-interval '1 hour')>=5 then
    raise exception using errcode='22023',message='Booking limit reached';
  end if;
  select e.id as shop,e.auto_confirm,e.preparation_minutes,s.name,s.price_cents,s.duration_minutes into offering
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from start_at)
  where e.slug=profile_slug and e.published and public.barberflow_booking_enabled(profile_slug) for share of e,p,s,ps,h;
  if not found or not exists (select 1 from barberflow_private.available_slots(profile_slug,professional,service,start_at::date) available where available.slot=start_at) then
    raise exception using errcode='22023', message='Slot unavailable';
  end if;
  insert into public.barberflow_schedule
    (establishment_id,professional_id,service_id,kind,state,starts_at,ends_at,service_name,price_cents,client_name,client_phone,booked_by,preparation_minutes,guest_online)
  values (offering.shop,professional,service,'appointment',case when offering.auto_confirm then 'scheduled' else 'pending' end,
    start_at,barberflow_private.service_finish(offering.shop,professional,start_at,offering.duration_minutes),
    offering.name,offering.price_cents,btrim(customer),nullif(btrim(phone),''),null,offering.preparation_minutes,true)
  returning id into entry;
  insert into barberflow_private.guest_booking_requests(request_id,booking_id) values(request_id,entry);
  return entry;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_guest_change(token uuid, shop_slug text, customer text, phone text, new_start timestamp without time zone DEFAULT NULL::timestamp without time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  booking record;
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
  duration integer;
begin
  select a.*,e.slug,e.published,e.auto_confirm,e.allow_customer_cancel,e.allow_customer_reschedule,e.change_notice_hours
  into booking
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  join barberflow_private.guest_booking_requests g on g.booking_id=a.id
  where g.request_id=token and e.slug=shop_slug and a.guest_online
    and lower(btrim(a.client_name))=lower(btrim(customer))
    and regexp_replace(a.client_phone,'[^0-9]','','g')=regexp_replace(phone,'[^0-9]','','g')
    and not exists(select 1 from public.barberflow_receipts r where r.appointment_id=a.id)
    and a.state in ('scheduled','pending')
  for update of a for share of e;
  if not found or booking.starts_at <= local_now
    or booking.starts_at < local_now+pg_catalog.make_interval(hours=>booking.change_notice_hours) then return false; end if;

  if new_start is null then
    if not booking.allow_customer_cancel then return false; end if;
    update public.barberflow_schedule set state='cancelled',customer_cancelled_at=now() where id=booking.id;
  else
    if not booking.allow_customer_reschedule or not booking.published or not isfinite(new_start) then return false; end if;
    perform 1 from public.barberflow_professionals p
      join public.barberflow_professional_services ps on ps.establishment_id=p.establishment_id and ps.professional_id=p.id
      join public.barberflow_services s on s.establishment_id=ps.establishment_id and s.id=ps.service_id and s.active
      join barberflow_private.effective_professional_hours h on h.establishment_id=p.establishment_id and h.professional_id=p.id
        and h.weekday=extract(dow from new_start)
      where p.establishment_id=booking.establishment_id and p.id=booking.professional_id and p.active and s.id=booking.service_id
      for share of p,ps,s,h;
    if not found then return false; end if;
    duration := coalesce(booking.work_duration_minutes,(extract(epoch from booking.ends_at-booking.starts_at)/60)::integer);
    if not exists (select 1 from barberflow_private.available_slots(booking.slug,booking.professional_id,booking.service_id,
      new_start::date,booking.id,duration,booking.preparation_minutes) slots where slots.slot=new_start) then return false; end if;
    update public.barberflow_schedule set starts_at=new_start,ends_at=barberflow_private.service_finish(booking.establishment_id,booking.professional_id,new_start,duration),
      state=case when booking.auto_confirm then 'scheduled' else 'pending' end where id=booking.id;
  end if;
  return found;
end;
$function$
;
CREATE OR REPLACE FUNCTION barberflow_private.available_slots(profile_slug text, professional uuid, service uuid, booking_day date, ignored uuid DEFAULT NULL::uuid, length_override integer DEFAULT NULL::integer, preparation_override integer DEFAULT NULL::integer)
 RETURNS TABLE(slot timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select candidate.start_at
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from booking_day)
  cross join lateral (select coalesce(length_override,s.duration_minutes) as duration,
    coalesce(preparation_override,e.preparation_minutes) as preparation) limits
  cross join lateral pg_catalog.generate_series(
    booking_day+h.starts_at, booking_day+h.ends_at-pg_catalog.make_interval(mins=>limits.duration),
    pg_catalog.make_interval(mins=>e.slot_step_minutes)
  ) candidate(start_at)
  where e.slug=profile_slug and e.published
    and (booking_day <> (now() at time zone 'America/Sao_Paulo')::date or not exists (
      select 1 from barberflow_private.professional_day d where d.shop=e.id and d.professional=available_slots.professional
        and d.day=booking_day and not d.available
    ))
    and booking_day between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+e.max_advance_days
    and candidate.start_at > (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(mins=>e.min_notice_minutes)
    and (h.break_start is null or candidate.start_at::time < h.break_start or candidate.start_at::time >= h.break_end)
    and barberflow_private.service_finish(e.id,professional,candidate.start_at,limits.duration) <= booking_day+h.ends_at
    and not exists (
      select 1 from public.barberflow_schedule a where a.professional_id=professional and a.establishment_id=e.id
        and a.id is distinct from ignored and a.state in ('pending','scheduled','completed','no_show')
        and tsrange(a.starts_at,a.ends_at+pg_catalog.make_interval(mins=>a.preparation_minutes),'[)')
          && tsrange(candidate.start_at,barberflow_private.service_finish(e.id,professional,candidate.start_at,limits.duration)+pg_catalog.make_interval(mins=>limits.preparation),'[)')
    )
  order by candidate.start_at;
$function$
;
CREATE OR REPLACE FUNCTION public.barberflow_team_booking_slots(shop_id uuid, professional uuid, service uuid, booking_day date)
 RETURNS TABLE(slot timestamp without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select candidate.start_at
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from booking_day)
  cross join lateral (select s.duration_minutes as duration,
    e.preparation_minutes as preparation) limits
  cross join lateral pg_catalog.generate_series(
    booking_day+h.starts_at, booking_day+h.ends_at-pg_catalog.make_interval(mins=>limits.duration),
    pg_catalog.make_interval(mins=>e.slot_step_minutes)
  ) candidate(start_at)
  where e.id=shop_id and barberflow_private.team_can_manage(e.id,professional)
    and (booking_day <> (now() at time zone 'America/Sao_Paulo')::date or not exists (
      select 1 from barberflow_private.professional_day d where d.shop=e.id and d.professional=barberflow_team_booking_slots.professional
        and d.day=booking_day and not d.available
    ))
    and booking_day between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+e.max_advance_days
    and candidate.start_at > (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(mins=>e.min_notice_minutes)
    and (h.break_start is null or candidate.start_at::time < h.break_start or candidate.start_at::time >= h.break_end)
    and barberflow_private.service_finish(e.id,professional,candidate.start_at,limits.duration) <= booking_day+h.ends_at
    and not exists (
      select 1 from public.barberflow_schedule a where a.professional_id=professional and a.establishment_id=e.id
        and a.state in ('pending','scheduled','completed','no_show')
        and tsrange(a.starts_at,a.ends_at+pg_catalog.make_interval(mins=>a.preparation_minutes),'[)')
          && tsrange(candidate.start_at,barberflow_private.service_finish(e.id,professional,candidate.start_at,limits.duration)+pg_catalog.make_interval(mins=>limits.preparation),'[)')
    )
  order by candidate.start_at;
$function$
;
notify pgrst, 'reload schema';
commit;

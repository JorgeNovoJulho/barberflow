alter table public.barberflow_professionals
  add column inherit_business_hours boolean not null default false;

grant insert(inherit_business_hours),update(inherit_business_hours) on public.barberflow_professionals to authenticated;

create view barberflow_private.effective_professional_hours as
  select h.establishment_id,h.professional_id,h.weekday,h.starts_at,h.ends_at,h.break_start,h.break_end
  from public.barberflow_professional_hours h
  join public.barberflow_professionals p on p.establishment_id=h.establishment_id and p.id=h.professional_id
  where not p.inherit_business_hours
  union all
  select p.establishment_id,p.id,d.weekday::smallint,parsed.starts_at,parsed.ends_at,parsed.break_start,parsed.break_end
  from public.barberflow_professionals p
  join public.barberflow_establishments e on e.id=p.establishment_id
  cross join generate_series(0,6) d(weekday)
  cross join lateral (select e.profile_details->'hours'->d.weekday::text as hours) profile
  cross join lateral (
    select
      case when profile.hours->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'start')::time end as starts_at,
      case when profile.hours->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'end')::time end as ends_at,
      case when profile.hours->>'breakStart' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'breakStart')::time end as break_start,
      case when profile.hours->>'breakEnd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'breakEnd')::time end as break_end
  ) parsed
  where p.inherit_business_hours and parsed.starts_at<parsed.ends_at
    and ((coalesce(profile.hours->>'breakStart','')='' and coalesce(profile.hours->>'breakEnd','')='')
      or (parsed.starts_at<parsed.break_start and parsed.break_start<parsed.break_end and parsed.break_end<parsed.ends_at));

revoke all on barberflow_private.effective_professional_hours from public,anon,authenticated;

create or replace function public.barberflow_create_schedule_entry(
  shop uuid, professional uuid, service uuid, start_at timestamp, block_end timestamp,
  customer text, phone text, note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  offering record;
  workday record;
  finish timestamp;
  entry_id uuid;
begin
  if not exists (select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then
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
    finish := start_at + pg_catalog.make_interval(mins => offering.duration_minutes);
    select * into workday from barberflow_private.effective_professional_hours
      where establishment_id=shop and professional_id=professional and weekday=extract(dow from start_at)
      for share;
    if not found or start_at::date <> finish::date or start_at::time < workday.starts_at
      or finish::time > workday.ends_at or (workday.break_start is not null
        and start_at::time < workday.break_end and finish::time > workday.break_start) then
      raise exception using errcode='22023', message='Outside working hours';
    end if;
    insert into public.barberflow_schedule
      (establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name,client_phone,notes)
      values (shop,professional,service,'appointment',start_at,finish,offering.name,offering.price_cents,
        btrim(customer),nullif(btrim(phone),''),coalesce(note,'')) returning id into entry_id;
  end if;
  return entry_id;
end;
$$;

create or replace function public.barberflow_reschedule(shop uuid, entry uuid, new_start timestamp)
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
  select * into workday from barberflow_private.effective_professional_hours
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

create or replace function barberflow_private.available_slots(profile_slug text, professional uuid, service uuid, booking_day date,
  ignored uuid default null, length_override integer default null, preparation_override integer default null)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
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
    and booking_day between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+e.max_advance_days
    and candidate.start_at > (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(mins=>e.min_notice_minutes)
    and (h.break_start is null or candidate.start_at::time >= h.break_end
      or (candidate.start_at+pg_catalog.make_interval(mins=>limits.duration))::time <= h.break_start)
    and not exists (
      select 1 from public.barberflow_schedule a where a.professional_id=professional and a.establishment_id=e.id
        and a.id is distinct from ignored and a.state in ('pending','scheduled','completed','no_show')
        and tsrange(a.starts_at,a.ends_at+pg_catalog.make_interval(mins=>a.preparation_minutes),'[)')
          && tsrange(candidate.start_at,candidate.start_at+pg_catalog.make_interval(mins=>limits.duration+limits.preparation),'[)')
    )
  order by candidate.start_at;
$$;

create or replace function public.barberflow_book_online(profile_slug text, professional uuid, service uuid,
  start_at timestamp, customer text, phone text)
returns uuid language plpgsql security definer set search_path='' as $$
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
    start_at,start_at+pg_catalog.make_interval(mins=>offering.duration_minutes),
    offering.name,offering.price_cents,btrim(customer),nullif(btrim(phone),''),buyer,offering.preparation_minutes)
  returning id into entry;
  return entry;
end;
$$;

create or replace function public.barberflow_customer_booking_change(entry uuid, new_start timestamp default null)
returns boolean language plpgsql security definer set search_path='' as $$
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
    update public.barberflow_schedule set state='cancelled' where id=entry;
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
    duration := (extract(epoch from booking.ends_at-booking.starts_at)/60)::integer;
    if not exists (select 1 from barberflow_private.available_slots(booking.slug,booking.professional_id,booking.service_id,
      new_start::date,entry,duration,booking.preparation_minutes) slots where slots.slot=new_start) then return false; end if;
    update public.barberflow_schedule set starts_at=new_start,ends_at=new_start+(booking.ends_at-booking.starts_at),
      state=case when booking.auto_confirm then 'scheduled' else 'pending' end where id=entry;
  end if;
  return found;
end;
$$;

create or replace function public.barberflow_profile_next_slots(profile_slug text)
returns table(professional_id uuid,slot timestamp)
language sql stable security definer set search_path='' as $$
  select p.id,next_slot.slot from public.barberflow_establishments e
  join public.barberflow_professionals p on p.establishment_id=e.id and p.active
  cross join lateral (
    select candidates.slot from pg_catalog.generate_series(0,least(30,e.max_advance_days)) days
    join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=p.id
      and h.weekday=extract(dow from (now() at time zone 'America/Sao_Paulo')::date+days)
    join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=p.id
    cross join lateral public.barberflow_public_slots(profile_slug,p.id,ps.service_id,
      (now() at time zone 'America/Sao_Paulo')::date+days) candidates
    order by candidates.slot limit 1
  ) next_slot
  where e.slug=profile_slug and e.published;
$$;

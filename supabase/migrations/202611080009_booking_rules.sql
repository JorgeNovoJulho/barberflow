alter table public.barberflow_establishments
  add column auto_confirm boolean not null default true,
  add column allow_customer_cancel boolean not null default true,
  add column allow_customer_reschedule boolean not null default true,
  add column min_notice_minutes integer not null default 0 check (min_notice_minutes between 0 and 10080),
  add column max_advance_days integer not null default 30 check (max_advance_days between 1 and 365),
  add column change_notice_hours integer not null default 0 check (change_notice_hours between 0 and 720),
  add column slot_step_minutes integer not null default 15 check (slot_step_minutes in (5,10,15,20,30,60)),
  add column preparation_minutes integer not null default 0 check (preparation_minutes between 0 and 180);
grant update (auto_confirm,allow_customer_cancel,allow_customer_reschedule,min_notice_minutes,max_advance_days,
  change_notice_hours,slot_step_minutes,preparation_minutes) on public.barberflow_establishments to authenticated;

alter table public.barberflow_schedule
  add column preparation_minutes integer not null default 0 check (preparation_minutes between 0 and 180),
  drop constraint barberflow_schedule_state_check,
  add constraint barberflow_schedule_state_check check (state in ('pending','scheduled','completed','cancelled','no_show'));

-- Replace the original exclusion constraint without depending on its generated name.
set local search_path = public, extensions, pg_catalog;
do $migration$
declare name_of_constraint name;
begin
  select conname into strict name_of_constraint from pg_catalog.pg_constraint
    where conrelid='public.barberflow_schedule'::regclass and contype='x';
  execute format('alter table public.barberflow_schedule drop constraint %I', name_of_constraint);
end;
$migration$;

alter table public.barberflow_schedule add constraint barberflow_schedule_no_overlap
  exclude using gist (professional_id with =,
    tsrange(starts_at,ends_at+make_interval(mins=>preparation_minutes),'[)') with &&)
  where (state in ('pending','scheduled','completed','no_show'));

create function public.barberflow_booking_limit(profile_slug text)
returns integer language sql stable security definer set search_path='' as $$
  select e.max_advance_days from public.barberflow_establishments e where e.slug=profile_slug and e.published;
$$;
revoke all on function public.barberflow_booking_limit(text) from public;
grant execute on function public.barberflow_booking_limit(text) to anon,authenticated;

create schema if not exists barberflow_private;
revoke all on schema barberflow_private from public,anon,authenticated;

create function barberflow_private.available_slots(profile_slug text, professional uuid, service uuid, booking_day date,
  ignored uuid default null, length_override integer default null, preparation_override integer default null)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select candidate.start_at
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join public.barberflow_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from booking_day)
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
revoke all on function barberflow_private.available_slots(text,uuid,uuid,date,uuid,integer,integer) from public,anon,authenticated;

create or replace function public.barberflow_public_slots(profile_slug text, professional uuid, service uuid, booking_day date)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select * from barberflow_private.available_slots(profile_slug,professional,service,booking_day);
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
  join public.barberflow_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from start_at)
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

create or replace function public.barberflow_set_schedule_state(shop uuid, entry uuid, new_state text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.barberflow_schedule s set state=new_state
    where s.establishment_id=shop and s.id=entry
      and ((s.state='scheduled' and (new_state='cancelled' or (s.kind='appointment' and new_state in ('completed','no_show'))))
        or (s.state='pending' and s.kind='appointment' and new_state in ('scheduled','cancelled')))
      and exists (select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
  return found;
end;
$$;

create function public.barberflow_customer_booking_change(entry uuid, new_start timestamp default null)
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
      join public.barberflow_professional_hours h on h.establishment_id=p.establishment_id and h.professional_id=p.id
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
revoke all on function public.barberflow_customer_booking_change(uuid,timestamp) from public,anon;
grant execute on function public.barberflow_customer_booking_change(uuid,timestamp) to authenticated;

create function public.barberflow_customer_reschedule_slots(entry uuid, booking_day date)
returns table(slot timestamp) language sql stable security definer set search_path='' as $$
  select slots.slot
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  cross join lateral barberflow_private.available_slots(e.slug,a.professional_id,a.service_id,booking_day,a.id,
    (extract(epoch from a.ends_at-a.starts_at)/60)::integer,a.preparation_minutes) slots
  where a.id=entry and a.booked_by=(select auth.uid()) and a.state in ('scheduled','pending')
    and e.allow_customer_reschedule and a.starts_at > (now() at time zone 'America/Sao_Paulo')
    and a.starts_at >= (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(hours=>e.change_notice_hours);
$$;
revoke all on function public.barberflow_customer_reschedule_slots(uuid,date) from public,anon;
grant execute on function public.barberflow_customer_reschedule_slots(uuid,date) to authenticated;

drop function public.barberflow_my_bookings();
create function public.barberflow_my_bookings()
returns table(id uuid,shop_name text,service_name text,starts_at timestamp,ends_at timestamp,state text,
  price_cents integer,can_cancel boolean,can_reschedule boolean)
language sql stable security definer set search_path='' as $$
  select a.id,e.name,a.service_name,a.starts_at,a.ends_at,a.state,a.price_cents,
    e.allow_customer_cancel and eligibility.can_change,
    e.published and e.allow_customer_reschedule and eligibility.can_change
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  cross join lateral (select a.state in ('scheduled','pending')
    and a.starts_at > (now() at time zone 'America/Sao_Paulo')
    and a.starts_at >= (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(hours=>e.change_notice_hours)
    as can_change) eligibility
  where a.booked_by=(select auth.uid()) order by a.starts_at desc limit 100;
$$;
revoke all on function public.barberflow_my_bookings() from public,anon;
grant execute on function public.barberflow_my_bookings() to authenticated;

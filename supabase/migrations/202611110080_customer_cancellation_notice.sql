alter table public.barberflow_schedule
  add column customer_cancelled_at timestamptz,
  add column cancellation_read_at timestamptz,
  add column cancellation_cleared_at timestamptz;


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
    duration := (extract(epoch from booking.ends_at-booking.starts_at)/60)::integer;
    if not exists (select 1 from barberflow_private.available_slots(booking.slug,booking.professional_id,booking.service_id,
      new_start::date,entry,duration,booking.preparation_minutes) slots where slots.slot=new_start) then return false; end if;
    update public.barberflow_schedule set starts_at=new_start,ends_at=new_start+(booking.ends_at-booking.starts_at),
      state=case when booking.auto_confirm then 'scheduled' else 'pending' end where id=entry;
  end if;
  return found;
end;
$$;

create or replace function public.barberflow_guest_change(token uuid, shop_slug text, customer text, phone text, new_start timestamp default null)
returns boolean language plpgsql security definer set search_path='' as $$
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
    duration := (extract(epoch from booking.ends_at-booking.starts_at)/60)::integer;
    if not exists (select 1 from barberflow_private.available_slots(booking.slug,booking.professional_id,booking.service_id,
      new_start::date,booking.id,duration,booking.preparation_minutes) slots where slots.slot=new_start) then return false; end if;
    update public.barberflow_schedule set starts_at=new_start,ends_at=new_start+(booking.ends_at-booking.starts_at),
      state=case when booking.auto_confirm then 'scheduled' else 'pending' end where id=booking.id;
  end if;
  return found;
end;
$$;

create or replace function public.barberflow_read_booking_notifications(shop uuid, seen_until timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.barberflow_schedule a set booking_read_at=now()
  where a.establishment_id=shop and (a.booked_by is not null or a.guest_online)
    and a.booking_created_at<=least(seen_until,now()) and a.booking_read_at is null
    and seen_until is not null and a.booking_cleared_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
  update public.barberflow_schedule a set cancellation_read_at=now()
  where a.establishment_id=shop and a.customer_cancelled_at<=least(seen_until,now())
    and seen_until is not null and a.cancellation_cleared_at is null and a.cancellation_read_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid());
$$;

create or replace function public.barberflow_clear_booking_notifications(shop uuid, seen_until timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.barberflow_schedule a set booking_cleared_at=now()
  where a.establishment_id=shop and (a.booked_by is not null or a.guest_online)
    and seen_until is not null and a.booking_created_at<=least(seen_until,now())
    and a.booking_cleared_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
  update public.barberflow_schedule a set cancellation_cleared_at=now()
  where a.establishment_id=shop and a.customer_cancelled_at<=least(seen_until,now())
    and seen_until is not null and a.cancellation_cleared_at is null and a.cancellation_cleared_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid());
$$;

create or replace function public.barberflow_booking_notifications(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with owner_shop as (
    select e.id from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()
  ), bookings as (
    select a.id,a.client_name,a.service_name,a.starts_at,a.booking_created_at,a.booking_read_at,'booking'::text as kind
    from public.barberflow_schedule a join owner_shop e on e.id=a.establishment_id
    where a.establishment_id=shop and (a.booked_by is not null or a.guest_online) and a.booking_created_at is not null and a.booking_cleared_at is null
    union all
    select a.id,a.client_name,a.service_name,a.starts_at,a.customer_cancelled_at,a.cancellation_read_at,'cancellation'
    from public.barberflow_schedule a join owner_shop e on e.id=a.establishment_id
    where a.customer_cancelled_at is not null and a.cancellation_cleared_at is null
  ), recent as (
    select * from (select bookings.*,row_number() over (
      partition by (booking_read_at is null) order by booking_created_at desc,id
    ) as notice_rank from bookings) ranked where notice_rank<=30
  )
  select jsonb_build_object(
    'unread',(select count(*) from bookings where booking_read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(r) order by (r.booking_read_at is null) desc,r.booking_created_at desc,r.id) from recent r),'[]'::jsonb),
    'as_of',now()
  );
$$;

create function public.barberflow_unread_customer_cancellations(shop uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select count(*) from public.barberflow_schedule a
  join public.barberflow_establishments e on e.id=a.establishment_id
  where e.id=shop and e.owner_id=auth.uid() and a.customer_cancelled_at is not null
    and a.cancellation_read_at is null and a.cancellation_cleared_at is null;
$$;
revoke all on function public.barberflow_unread_customer_cancellations(uuid) from public,anon;
grant execute on function public.barberflow_unread_customer_cancellations(uuid) to authenticated;

alter table public.barberflow_schedule
  add column booking_created_at timestamptz,
  add column booking_read_at timestamptz;
alter table public.barberflow_schedule alter column booking_created_at set default now();

create index barberflow_booking_notifications on public.barberflow_schedule
  (establishment_id,booking_created_at desc,id)
  where booked_by is not null and booking_created_at is not null;

create function public.barberflow_booking_notifications(shop uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bookings as (
    select a.id,a.client_name,a.service_name,a.starts_at,a.booking_created_at,a.booking_read_at
    from public.barberflow_schedule a
    where a.establishment_id=shop and a.booked_by is not null and a.booking_created_at is not null
  ), recent as (
    select * from bookings order by (booking_read_at is null) desc,booking_created_at desc,id limit 30
  )
  select jsonb_build_object(
    'unread',(select count(*) from bookings where booking_read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(r) order by (r.booking_read_at is null) desc,r.booking_created_at desc,r.id) from recent r),'[]'::jsonb),
    'as_of',now()
  );
$$;

create function public.barberflow_read_booking_notifications(shop uuid, seen_until timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.barberflow_schedule a set booking_read_at=now()
  where a.establishment_id=shop and a.booked_by is not null
    and a.booking_created_at<=least(seen_until,now()) and a.booking_read_at is null
    and seen_until is not null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
$$;

revoke all on function public.barberflow_booking_notifications(uuid),
  public.barberflow_read_booking_notifications(uuid,timestamptz) from public,anon;
grant execute on function public.barberflow_booking_notifications(uuid),
  public.barberflow_read_booking_notifications(uuid,timestamptz) to authenticated;

alter table public.barberflow_showcase_orders
  add column notice_read_at timestamptz,
  add column notice_cleared_at timestamptz;

update public.barberflow_showcase_orders set notice_read_at=created_at
where status<>'pending' or expires_at<=now();

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
  update public.barberflow_showcase_orders o set notice_read_at=now()
  where o.establishment_id=shop and o.created_at<=least(seen_until,now())
    and seen_until is not null and o.notice_cleared_at is null
    and o.notice_read_at is null
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
  update public.barberflow_showcase_orders o set notice_cleared_at=now()
  where o.establishment_id=shop and o.created_at<=least(seen_until,now())
    and seen_until is not null and o.notice_cleared_at is null
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
    union all
    select o.id,o.buyer_name,o.product_name,null,o.created_at,o.notice_read_at,'showcase_order'
    from public.barberflow_showcase_orders o join owner_shop e on e.id=o.establishment_id
    where o.notice_cleared_at is null
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

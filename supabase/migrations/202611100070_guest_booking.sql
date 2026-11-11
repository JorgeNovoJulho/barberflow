alter table public.barberflow_schedule add column guest_online boolean not null default false;
create table barberflow_private.guest_booking_requests (
  request_id uuid primary key,
  booking_id uuid not null unique references public.barberflow_schedule(id) on delete cascade
);
revoke all on barberflow_private.guest_booking_requests from public,anon,authenticated;
create function public.barberflow_book_guest(profile_slug text, professional uuid, service uuid,
  start_at timestamp, customer text, phone text, request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
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
    start_at,start_at+pg_catalog.make_interval(mins=>offering.duration_minutes),
    offering.name,offering.price_cents,btrim(customer),nullif(btrim(phone),''),null,offering.preparation_minutes,true)
  returning id into entry;
  insert into barberflow_private.guest_booking_requests(request_id,booking_id) values(request_id,entry);
  return entry;
end;
$$;

create or replace function public.barberflow_booking_notifications(shop uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bookings as (
    select a.id,a.client_name,a.service_name,a.starts_at,a.booking_created_at,a.booking_read_at
    from public.barberflow_schedule a
    where a.establishment_id=shop and (a.booked_by is not null or a.guest_online) and a.booking_created_at is not null
  ), recent as (
    select * from bookings order by (booking_read_at is null) desc,booking_created_at desc,id limit 30
  )
  select jsonb_build_object(
    'unread',(select count(*) from bookings where booking_read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(r) order by (r.booking_read_at is null) desc,r.booking_created_at desc,r.id) from recent r),'[]'::jsonb),
    'as_of',now()
  );
$$;

create or replace function public.barberflow_read_booking_notifications(shop uuid, seen_until timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.barberflow_schedule a set booking_read_at=now()
  where a.establishment_id=shop and (a.booked_by is not null or a.guest_online)
    and a.booking_created_at<=least(seen_until,now()) and a.booking_read_at is null
    and seen_until is not null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
$$;

revoke all on function public.barberflow_booking_notifications(uuid),
  public.barberflow_read_booking_notifications(uuid,timestamptz) from public,anon;
grant execute on function public.barberflow_booking_notifications(uuid),
  public.barberflow_read_booking_notifications(uuid,timestamptz) to authenticated;
create or replace function barberflow_private.require_bookable_subscription() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.booked_by is not null or new.guest_online) and not barberflow_private.subscription_bookable(new.establishment_id) then
    raise exception using errcode='22023',message='Public booking paused',detail='subscription_paused';
  end if;
  return new;
end;
$$;
create or replace function public.barberflow_dashboard(shop uuid, period_days integer)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select (now() at time zone 'America/Sao_Paulo') as local_now,
      (now() at time zone 'America/Sao_Paulo')::date as today
    from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) and period_days in (1,7,30)
  ), report_window as (
    select local_now,today,today-(period_days-1) as first_day,today+1 as last_day
    from bounds
  ), appointments as (
    select a.* from public.barberflow_schedule a cross join report_window w
    where a.establishment_id=shop and a.kind='appointment'
      and a.starts_at>=w.first_day::timestamp and a.starts_at<w.last_day::timestamp
  ), metrics as (
    select count(*) as appointments,
      count(*) filter(where a.state='completed') as completed,
      count(*) filter(where a.state='cancelled') as cancelled,
      count(*) filter(where a.state='no_show') as no_show,
      count(*) filter(where a.state='pending') as pending,
      count(*) filter(where a.booked_by is not null or a.guest_online) as online,
      coalesce(sum(a.price_cents) filter(where a.state in ('scheduled','pending')),0) as scheduled_cents
    from appointments a
  ), sales as (
    select count(*) as closed_orders,coalesce(sum(r.total_cents),0) as closed_cents
    from public.barberflow_receipts r cross join report_window w
    where r.establishment_id=shop
      and r.closed_at >= (w.first_day::timestamp at time zone 'America/Sao_Paulo')
      and r.closed_at < (w.last_day::timestamp at time zone 'America/Sao_Paulo')
  ), confirmed_payments as (
    select p.amount_cents as amount,p.recorded_at as paid_at
    from barberflow_private.receipt_payments p join public.barberflow_receipts r using (appointment_id)
    cross join report_window w where r.establishment_id=shop and p.reversed_at is null
      and p.recorded_at>=w.first_day::timestamp at time zone 'America/Sao_Paulo'
      and p.recorded_at<w.last_day::timestamp at time zone 'America/Sao_Paulo'
    union all
    select f.amount_cents,c.paid_at from barberflow_private.counter_sales c
    join barberflow_private.finance_settlements f on f.id=c.id and f.entry_id=c.id
    cross join report_window w where c.shop=$1 and c.state='paid' and f.reversed_at is null
      and c.paid_at>=w.first_day::timestamp at time zone 'America/Sao_Paulo'
      and c.paid_at<w.last_day::timestamp at time zone 'America/Sao_Paulo'
    union all
    select o.total_cents,o.paid_at from public.barberflow_showcase_orders o
    cross join report_window w where o.establishment_id=shop and o.status in ('paid','ready','collected')
      and o.paid_at>=w.first_day::timestamp at time zone 'America/Sao_Paulo'
      and o.paid_at<w.last_day::timestamp at time zone 'America/Sao_Paulo'
  ), confirmed_revenue as (
    select coalesce(sum(amount),0) as confirmed_cents from confirmed_payments
  ), previous as (
    select count(*) as previous_appointments
    from public.barberflow_schedule a cross join report_window w
    where a.establishment_id=shop and a.kind='appointment'
      and a.starts_at>=(w.first_day-period_days)::timestamp and a.starts_at<w.first_day::timestamp
  ), today_stats as (
    select count(*) filter(where a.starts_at>=b.today::timestamp and a.state in ('scheduled','pending','completed','no_show')) as marked_today,
      count(*) filter(where a.starts_at>=b.today::timestamp and a.state='completed') as completed_today,
      count(*) filter(where a.state='scheduled' and a.starts_at<=b.local_now and a.ends_at>b.local_now) as in_progress,
      count(*) filter(where a.starts_at>=b.today::timestamp and a.state='pending') as pending_today
    from public.barberflow_schedule a cross join bounds b
    where a.establishment_id=shop and a.kind='appointment'
      and a.ends_at>b.today::timestamp and a.starts_at<(b.today+1)::timestamp
  ), slot_service as (
    select s.id,s.name from public.barberflow_services s cross join bounds
    where s.establishment_id=shop and s.active
      and exists (select 1 from public.barberflow_professional_services ps
        join public.barberflow_professionals p on p.id=ps.professional_id and p.establishment_id=shop and p.active
        where ps.establishment_id=shop and ps.service_id=s.id)
    order by s.display_order,s.name,s.id limit 1
  ), today_slots as (
    select s.name,count(distinct x.slot) as quantity from slot_service s cross join bounds b
    join public.barberflow_establishments e on e.id=shop and e.published
    left join public.barberflow_professional_services ps on ps.service_id=s.id and ps.establishment_id=shop
    left join lateral public.barberflow_public_slots(e.slug,ps.professional_id,s.id,b.today) x on true
    group by s.name
  ), today_cash as (
    select coalesce(sum(p.amount),0) as received_today
    from confirmed_payments p cross join bounds b
    where p.paid_at>=b.today::timestamp at time zone 'America/Sao_Paulo'
  ), upcoming as (
    select a.id,a.starts_at,a.client_name,a.service_name,a.state,p.name as professional_name
    from public.barberflow_schedule a join public.barberflow_professionals p
      on p.establishment_id=a.establishment_id and p.id=a.professional_id cross join bounds b
    where a.establishment_id=shop and a.kind='appointment'
      and a.state in ('scheduled','pending') and a.starts_at>=b.local_now
    order by a.starts_at,a.id limit 8
  )
  select jsonb_build_object('first_day',w.first_day,'today',w.today)
    || to_jsonb(m) || to_jsonb(revenue) || to_jsonb(s) || to_jsonb(pr) || to_jsonb(t)
    || jsonb_build_object(
      'free_slots',(select quantity from today_slots),
      'slot_service',(select name from today_slots),
      'received_today',case when barberflow_private.finance_unlocked(shop) then (select received_today from today_cash) end,
      'upcoming_count',(select count(*) from public.barberflow_schedule a where a.establishment_id=shop
        and a.kind='appointment' and a.state in ('scheduled','pending') and a.starts_at>=w.local_now),
      'active_clients',(select count(*) from public.barberflow_clients c where c.establishment_id=shop and c.active),
      'upcoming',coalesce((select jsonb_agg(to_jsonb(u) order by u.starts_at,u.id) from upcoming u),'[]'::jsonb)
    )
  from report_window w cross join metrics m cross join sales s cross join confirmed_revenue revenue cross join previous pr cross join today_stats t;
$$;

revoke all on function public.barberflow_book_guest(text,uuid,uuid,timestamp,text,text,uuid) from public;
grant execute on function public.barberflow_book_guest(text,uuid,uuid,timestamp,text,text,uuid) to anon,authenticated;

create function public.barberflow_guest_confirmation(request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('state',a.state,'start',a.starts_at,'service',a.service_name,'professional',p.name,'shop',e.name,'slug',e.slug)
  from barberflow_private.guest_booking_requests g
  join public.barberflow_schedule a on a.id=g.booking_id
  join public.barberflow_establishments e on e.id=a.establishment_id
  join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=e.id
  where g.request_id=barberflow_guest_confirmation.request_id;
$$;
revoke all on function public.barberflow_guest_confirmation(uuid) from public;
grant execute on function public.barberflow_guest_confirmation(uuid) to anon,authenticated;

create or replace function public.barberflow_commission_report(shop_id uuid, period text, reference_day date)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select e.name, e.checkout_timezone as tz,
      coalesce(reference_day,(now() at time zone e.checkout_timezone)::date) as day
    from public.barberflow_establishments e where e.id=shop_id
      and barberflow_private.counter_allowed(shop_id) and period in ('dia','semana','quinzena','mes')
  ), dates as (
    select name,tz,
      case period when 'semana' then date_trunc('week',day)::date
        when 'quinzena' then date_trunc('month',day)::date+case when extract(day from day)>15 then 15 else 0 end
        when 'mes' then date_trunc('month',day)::date else day end as first,
      case period when 'semana' then date_trunc('week',day)::date+7
        when 'quinzena' then case when extract(day from day)<=15 then date_trunc('month',day)::date+15 else (date_trunc('month',day)+interval '1 month')::date end
        when 'mes' then (date_trunc('month',day)+interval '1 month')::date else day+1 end as ending
    from bounds
  ), orders as (
    select r.appointment_id as id,a.professional_id,
      upper(left(r.appointment_id::text,8)) as number,
      r.closed_at as closed,case when (a.booked_by is not null or a.guest_online) then 'online' else 'porta' end as origin,
      jsonb_build_array(jsonb_build_object('name',a.service_name,'kind','service','units',1,'price',r.service_cents))
        || coalesce((select jsonb_agg(jsonb_build_object('name',l.product_name,'kind','product','units',l.quantity,'price',l.unit_price_cents) order by l.product_id)
          from public.barberflow_order_products l where l.appointment_id=r.appointment_id and l.establishment_id=shop_id),'[]') as items,
      round(r.service_cents::numeric*r.commission_bps/10000) as service_commission,
      case when r.products_cents=0 then 0 else round(r.products_cents::numeric*r.product_commission_bps/10000) end as product_commission
    from public.barberflow_receipts r
    join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=r.establishment_id
    cross join dates d
    where r.establishment_id=shop_id and r.closed_at>=d.first::timestamp at time zone d.tz and r.closed_at<d.ending::timestamp at time zone d.tz
    union all
    select s.id,c.professional_id,s.number,s.paid_at,'balcao',s.items,
      round(s.service_cents::numeric*c.service_bps/10000),
      round(s.product_cents::numeric*c.product_bps/10000)
    from barberflow_private.counter_sales s
    join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null
    left join barberflow_private.counter_commission c on c.sale_id=s.id
    cross join dates d
    where s.shop=shop_id and s.state='paid' and s.paid_at>=d.first::timestamp at time zone d.tz and s.paid_at<d.ending::timestamp at time zone d.tz
  )
  select jsonb_build_object('shop',d.name,'timezone',d.tz,'first',d.first,'last',d.ending-1,
    'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('receipt_id',link.receipt_id) order by o.closed,o.id)
      from orders o left join barberflow_private.commission_receipt_orders link
      on link.shop=shop_id and link.order_id=o.id and link.origin=case when o.origin='balcao' then 'balcao' else 'agenda' end),'[]'),
    'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
      from public.barberflow_professionals p where p.establishment_id=shop_id),'[]'))
  from dates d;
$$;

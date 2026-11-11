create function public.barberflow_guest_details(token uuid, shop_slug text, customer text, phone text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'service',a.service_name,'price',a.price_cents,'start',a.starts_at,'end',a.ends_at,'professional',p.name,
    'professional_id',p.id,'service_id',a.service_id,'state',a.state,'reason',a.cancellation_reason,
    'cancel',eligibility.can_change and e.allow_customer_cancel,
    'reschedule',eligibility.can_change and e.allow_customer_reschedule and e.published,
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',s.service_name,'price',s.price_cents,'units',1))
      from public.barberflow_order_services s where s.appointment_id=a.id and s.establishment_id=e.id),'[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('name',l.product_name,'price',l.unit_price_cents,'units',l.quantity))
      from public.barberflow_order_products l where l.appointment_id=a.id and l.establishment_id=e.id),'[]'::jsonb))
  from barberflow_private.guest_booking_requests g
  join public.barberflow_schedule a on a.id=g.booking_id
  join public.barberflow_establishments e on e.id=a.establishment_id
  join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=e.id
  cross join lateral (select a.state in ('pending','scheduled')
    and a.starts_at > now() at time zone 'America/Sao_Paulo'
    and a.starts_at >= (now() at time zone 'America/Sao_Paulo')+make_interval(hours=>e.change_notice_hours)
    and not exists(select 1 from public.barberflow_receipts r where r.appointment_id=a.id) as can_change) eligibility
  where g.request_id=token and e.slug=shop_slug and a.guest_online
    and lower(btrim(a.client_name))=lower(btrim(customer))
    and regexp_replace(a.client_phone,'[^0-9]','','g')=regexp_replace(phone,'[^0-9]','','g');
$$;
create function public.barberflow_guest_change(token uuid, shop_slug text, customer text, phone text, new_start timestamp default null)
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
    update public.barberflow_schedule set state='cancelled' where id=booking.id;
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


revoke all on function public.barberflow_guest_details(uuid,text,text,text),public.barberflow_guest_change(uuid,text,text,text,timestamp) from public;
grant execute on function public.barberflow_guest_details(uuid,text,text,text),public.barberflow_guest_change(uuid,text,text,text,timestamp) to anon,authenticated;

create function public.barberflow_dashboard_free_times(shop uuid)
returns table(slot timestamp) language sql stable security definer set search_path='' as $$
  select distinct x.slot from public.barberflow_establishments e
  cross join lateral (
    select s.id from public.barberflow_services s where s.establishment_id=e.id and s.active
      and exists(select 1 from public.barberflow_professional_services ps join public.barberflow_professionals p
        on p.id=ps.professional_id and p.establishment_id=e.id and p.active where ps.establishment_id=e.id and ps.service_id=s.id)
    order by s.display_order,s.name,s.id limit 1
  ) service
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.service_id=service.id
  cross join lateral public.barberflow_public_slots(e.slug,ps.professional_id,service.id,(now() at time zone 'America/Sao_Paulo')::date) x
  where e.id=shop and e.owner_id=auth.uid() and e.published order by x.slot;
$$;
revoke all on function public.barberflow_dashboard_free_times(uuid) from public,anon;
grant execute on function public.barberflow_dashboard_free_times(uuid) to authenticated;

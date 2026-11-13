create or replace function public.barberflow_professional_order(shop uuid, appointment uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('starts',a.starts_at,'booked_by',a.booked_by,'professional',p.name,'professional_photo',p.photo_url,'client',a.client_name,'phone',a.client_phone,'service',a.service_name,
    'base',a.price_cents,'state',a.state,'closed',r.closed_at,
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.product_id,'name',p.product_name,'units',p.quantity,'cents',p.line_total_cents) order by p.product_name)
      from public.barberflow_order_products p where p.establishment_id=shop and p.appointment_id=appointment),'[]'),
    'services',coalesce((select jsonb_agg(jsonb_build_object('id',s.service_id,'name',s.service_name,'cents',s.price_cents) order by s.service_name)
      from public.barberflow_order_services s where s.establishment_id=shop and s.appointment_id=appointment),'[]'),
    'product_options',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name)
      from public.barberflow_products p where p.establishment_id=shop and p.active and p.stock>0 and p.deleted_at is null),'[]'),
    'service_options',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name)
      from public.barberflow_services s where s.establishment_id=shop and s.active and s.deleted_at is null
        and exists(select 1 from public.barberflow_professional_services ps where ps.establishment_id=shop and ps.professional_id=a.professional_id and ps.service_id=s.id)),'[]'))
  from public.barberflow_schedule a
  join public.barberflow_professionals p on p.establishment_id=a.establishment_id and p.id=a.professional_id
  left join public.barberflow_receipts r on r.establishment_id=a.establishment_id and r.appointment_id=a.id
  where a.establishment_id=shop and a.id=appointment and a.kind='appointment'
    and a.professional_id=barberflow_private.individual_professional(shop) and (a.professional_checked_in_at is not null or a.state='completed');
$$;

create function public.barberflow_professional_settle_order(shop uuid, appointment uuid, method text, expected bigint, tendered bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare bill bigint;
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  if method is null or method not in ('pix','debit','credit','cash') or expected is null or expected<=0
    or (method='cash' and (tendered is null or tendered<expected)) then return false; end if;
  if exists(select 1 from public.barberflow_receipts r where r.establishment_id=shop and r.appointment_id=appointment) then return false; end if;
  bill := public.barberflow_close_order(shop,appointment);
  if bill is distinct from expected then raise exception 'O total da comanda mudou'; end if;
  insert into barberflow_private.receipt_payments(id,appointment_id,amount_cents,method,recorded_by)
    values(gen_random_uuid(),appointment,bill,case when method in ('debit','credit') then 'card' else method end,auth.uid());
  return true;
end;
$$;
revoke all on function public.barberflow_professional_settle_order(uuid,uuid,text,bigint,bigint) from public,anon;
grant execute on function public.barberflow_professional_settle_order(uuid,uuid,text,bigint,bigint) to authenticated;

create function public.barberflow_professional_order_pix(shop uuid, appointment uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  select jsonb_build_object('pix_key',p.pix_key,'merchant',p.merchant,'city',p.city) into result
  from public.barberflow_showcase_pix p where p.establishment_id=shop;
  return result;
end;
$$;
revoke all on function public.barberflow_professional_order_pix(uuid,uuid) from public,anon;
grant execute on function public.barberflow_professional_order_pix(uuid,uuid) to authenticated;

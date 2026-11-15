create or replace function public.barberflow_professional_order(shop uuid, appointment uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('starts',a.starts_at,'booked_by',a.booked_by,'professional',p.name,'professional_photo',p.photo_url,'client',a.client_name,'phone',a.client_phone,'service',a.service_name,
    'base',a.price_cents,'state',a.state,'closed',r.closed_at,'paid_at',case when payments.total>=r.total_cents then payments.last_received end,
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
  left join lateral (
    select sum(p.amount_cents) as total,max(p.recorded_at) as last_received
    from barberflow_private.receipt_payments p
    where p.appointment_id=r.appointment_id and p.reversed_at is null
  ) payments on true
  where a.establishment_id=shop and a.id=appointment and a.kind='appointment'
    and a.professional_id=barberflow_private.individual_professional(shop) and (a.professional_checked_in_at is not null or a.state='completed');
$$;

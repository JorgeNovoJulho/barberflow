create function barberflow_private.require_appointment_order_access(shop uuid, appointment uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()) then
    perform barberflow_private.require_inventory_owner(shop);
    return;
  end if;
  perform 1 from public.barberflow_schedule s where s.establishment_id=shop and s.id=appointment
    and s.professional_id=barberflow_private.individual_professional(shop) and s.kind='appointment'
    and s.professional_checked_in_at is not null for update;
  if not found then raise exception 'Acesso a comanda negado.' using errcode='42501'; end if;
end;
$$;
revoke all on function barberflow_private.require_appointment_order_access(uuid,uuid) from public,anon,authenticated;

create function public.barberflow_professional_order(shop uuid, appointment uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('client',a.client_name,'phone',a.client_phone,'service',a.service_name,
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
  left join public.barberflow_receipts r on r.establishment_id=a.establishment_id and r.appointment_id=a.id
  where a.establishment_id=shop and a.id=appointment and a.kind='appointment'
    and a.professional_id=barberflow_private.individual_professional(shop) and a.professional_checked_in_at is not null;
$$;
revoke all on function public.barberflow_professional_order(uuid,uuid) from public,anon;
grant execute on function public.barberflow_professional_order(uuid,uuid) to authenticated;
create or replace function public.barberflow_set_order_product(shop uuid, appointment uuid, product uuid, units integer)
returns void language plpgsql security definer set search_path='' as $$
declare item record; normal_price integer; today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  perform 1 from public.barberflow_schedule where establishment_id=shop and id=appointment
    and kind='appointment' and state in ('scheduled','completed') for update;
  if not found or exists(select 1 from public.barberflow_receipts where appointment_id=appointment) then
    raise exception using errcode='22023',message='Order is not editable';
  end if;
  if units is null or units not between 0 and 10000 then raise exception using errcode='22023',message='Invalid units'; end if;
  if units=0 then
    delete from public.barberflow_order_products where appointment_id=appointment and product_id=product and establishment_id=shop;
    return;
  end if;
  select name,sku,barcode,price_cents,promo_units,promo_cents,
    case when expires_on is not null then least(expires_on,promo_until) end as offer_end into item
    from public.barberflow_products where establishment_id=shop and id=product and active and deleted_at is null for share;
  if not found then raise exception using errcode='22023',message='Product unavailable',detail='product_inactive'; end if;
  select coalesce((select l.unit_price_cents from public.barberflow_order_products l
    where l.appointment_id=appointment and l.product_id=product),item.price_cents) into normal_price;
  if item.offer_end is null or item.offer_end<today or item.promo_cents>=item.promo_units::bigint*normal_price then
    item.promo_units:=null;
    item.promo_cents:=null;
    item.offer_end:=null;
  end if;
  insert into public.barberflow_order_products(establishment_id,appointment_id,product_id,product_name,
    quantity,unit_price_cents,product_sku,product_barcode,promo_units,promo_cents,promo_until)
    values(shop,appointment,product,item.name,units,normal_price,item.sku,item.barcode,
      item.promo_units,item.promo_cents,case when item.promo_units is not null then item.offer_end end)
    on conflict(appointment_id,product_id) do update set quantity=excluded.quantity,
      product_sku=coalesce(barberflow_order_products.product_sku,excluded.product_sku),
      product_barcode=coalesce(barberflow_order_products.product_barcode,excluded.product_barcode),
      promo_units=excluded.promo_units,promo_cents=excluded.promo_cents,promo_until=excluded.promo_until;
end;
$$;
create or replace function public.barberflow_appointment_order_number(shop uuid, appointment uuid)
returns text language plpgsql security definer set search_path='' as $$
declare number_value text; yr integer; next_number integer;
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  select extract(year from coalesce(r.closed_at at time zone barberflow_private.counter_timezone(shop),
    now() at time zone barberflow_private.counter_timezone(shop))) into yr
  from public.barberflow_schedule s left join public.barberflow_receipts r on r.appointment_id=s.id
  where s.establishment_id=shop and s.id=appointment and s.kind='appointment'
    and (s.state in ('scheduled','completed') or r.appointment_id is not null) for update of s;
  if not found then return null; end if;
  select a.number into number_value from barberflow_private.appointment_order_numbers a where a.appointment_id=appointment;
  if found then return number_value; end if;
  next_number:=barberflow_private.next_comanda_number(shop,yr);
  if next_number is null then raise exception using errcode='22023',message='Order numbers exhausted'; end if;
  insert into barberflow_private.appointment_order_numbers(appointment_id,shop,sale_year,sequence_number)
  values(appointment,shop,yr,next_number) returning number into number_value;
  return number_value;
end;
$$;
create or replace function public.barberflow_set_order_service(shop uuid, appointment uuid, service uuid, remove_item boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  perform 1 from public.barberflow_schedule a where a.establishment_id=shop and a.id=appointment
    and a.kind='appointment' and a.state in ('scheduled','completed') for update;
  if not found or exists(select 1 from public.barberflow_receipts r where r.appointment_id=appointment) then return false; end if;
  if remove_item then
    delete from public.barberflow_order_services l where l.establishment_id=shop and l.appointment_id=appointment and l.service_id=service;
  else
    insert into public.barberflow_order_services(establishment_id,appointment_id,service_id,service_name,price_cents)
    select shop,appointment,s.id,s.name,s.price_cents from public.barberflow_services s
    where s.establishment_id=shop and s.id=service and s.active and s.deleted_at is null
      and (exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid())
        or exists(select 1 from public.barberflow_professional_services ps where ps.establishment_id=shop
          and ps.professional_id=barberflow_private.individual_professional(shop) and ps.service_id=service))
    on conflict do nothing;
  end if;
  return found;
end;
$$;
create or replace function public.barberflow_close_order(shop uuid, appointment uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; booked record; line record; subtotal bigint := 0; result bigint; service_total bigint;
begin
  perform barberflow_private.require_appointment_order_access(shop,appointment);
  select price_cents,state into booked from public.barberflow_schedule
    where establishment_id=shop and id=appointment and kind='appointment' for update;
  if not found or booked.state not in ('scheduled','completed') then raise exception using errcode='22023',message='Complete the appointment before closing'; end if;
  select total_cents into result from public.barberflow_receipts where establishment_id=shop and appointment_id=appointment;
  if found then return result; end if;

  perform public.barberflow_appointment_order_number(shop,appointment);
  select booked.price_cents+coalesce(sum(s.price_cents),0) into service_total
    from public.barberflow_order_services s where s.establishment_id=shop and s.appointment_id=appointment;
  if booked.state='scheduled' and not public.barberflow_set_schedule_state(shop,appointment,'completed') then
    raise exception using errcode='22023',message='Could not complete the appointment';
  end if;
  for line in select * from public.barberflow_order_products
    where establishment_id=shop and appointment_id=appointment order by product_id loop
    if line.promo_units is not null and line.quantity>=line.promo_units and line.promo_until<today then
      raise exception using errcode='22023',message='Promotion expired',detail='promotion_expired';
    end if;
    update public.barberflow_products set stock=stock-line.quantity
      where establishment_id=shop and id=line.product_id and active and deleted_at is null and stock>=line.quantity
        and (line.promo_units is null or line.quantity<line.promo_units or expires_on>=today);
    if not found then raise exception using errcode='22023',message='Insufficient stock'; end if;
    insert into public.barberflow_stock_movements(establishment_id,product_id,appointment_id,delta,reason,actor_id)
      values(shop,line.product_id,appointment,-line.quantity,'Venda na comanda',(select auth.uid()));
    subtotal := subtotal+line.line_total_cents;
  end loop;
  if service_total+subtotal>99999999 then raise exception using errcode='22023',message='Order total exceeded'; end if;
  insert into public.barberflow_receipts(appointment_id,establishment_id,service_cents,products_cents)
    values(appointment,shop,service_total,subtotal) returning total_cents into result;
  return result;
end;
$$;

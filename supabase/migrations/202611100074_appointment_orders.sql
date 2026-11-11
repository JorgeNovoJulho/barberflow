create table barberflow_private.appointment_order_numbers (
  appointment_id uuid primary key,
  shop uuid not null,
  sale_year integer not null,
  sequence_number integer not null check(sequence_number between 1 and 999999),
  number text generated always as (substr(lpad(sequence_number::text,6,'0'),1,3)||'.'||right(lpad(sequence_number::text,6,'0'),3)||'.'||sale_year::text) stored,
  unique(shop,sale_year,sequence_number),
  foreign key(shop,appointment_id) references public.barberflow_schedule(establishment_id,id) on delete cascade
);
revoke all on barberflow_private.appointment_order_numbers from public,anon,authenticated;

create function barberflow_private.next_comanda_number(shop_id uuid, yr integer)
returns integer language plpgsql set search_path='' as $$
declare candidate integer; last_used integer;
begin
  insert into barberflow_private.counter_sale_numbers(shop) values(shop_id) on conflict do nothing;
  select last_number into last_used from barberflow_private.counter_sale_numbers where shop=shop_id for update;
  candidate:=last_used%999999+1;
  if exists(select 1 from barberflow_private.counter_sales s where s.shop=shop_id and s.sale_year=yr and s.sequence_number=candidate)
    or exists(select 1 from barberflow_private.appointment_order_numbers a where a.shop=shop_id and a.sale_year=yr and a.sequence_number=candidate) then
    select available into candidate from generate_series(1,999999) available
    where not exists(select 1 from barberflow_private.counter_sales s where s.shop=shop_id and s.sale_year=yr and s.sequence_number=available)
      and not exists(select 1 from barberflow_private.appointment_order_numbers a where a.shop=shop_id and a.sale_year=yr and a.sequence_number=available)
    order by available limit 1;
    if candidate is null then return null; end if;
  end if;
  update barberflow_private.counter_sale_numbers set last_number=candidate where shop=shop_id;
  return candidate;
end;
$$;
revoke all on function barberflow_private.next_comanda_number(uuid,integer) from public,anon,authenticated;

create function public.barberflow_appointment_order_number(shop uuid, appointment uuid)
returns text language plpgsql security definer set search_path='' as $$
declare number_value text; yr integer; next_number integer;
begin
  perform barberflow_private.require_inventory_owner(shop);
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
revoke all on function public.barberflow_appointment_order_number(uuid,uuid) from public,anon;
grant execute on function public.barberflow_appointment_order_number(uuid,uuid) to authenticated;

do $$
declare receipt record; yr integer;
begin
  for receipt in select appointment_id,establishment_id,closed_at from public.barberflow_receipts order by closed_at,appointment_id loop
    yr:=extract(year from receipt.closed_at at time zone barberflow_private.counter_timezone(receipt.establishment_id));
    insert into barberflow_private.appointment_order_numbers(appointment_id,shop,sale_year,sequence_number)
    values(receipt.appointment_id,receipt.establishment_id,yr,barberflow_private.next_comanda_number(receipt.establishment_id,yr));
  end loop;
end;
$$;

create table public.barberflow_order_services (
  establishment_id uuid not null,
  appointment_id uuid not null,
  service_id uuid not null,
  service_name text not null,
  price_cents integer not null check(price_cents>=0),
  primary key(appointment_id,service_id),
  foreign key(establishment_id,appointment_id) references public.barberflow_schedule(establishment_id,id),
  foreign key(establishment_id,service_id) references public.barberflow_services(establishment_id,id)
);
alter table public.barberflow_order_services enable row level security;
revoke all on public.barberflow_order_services from public,anon,authenticated;
grant select on public.barberflow_order_services to authenticated;
create policy appointment_order_services_owner on public.barberflow_order_services for select to authenticated
using (exists(select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));

create function public.barberflow_set_order_service(shop uuid, appointment uuid, service uuid, remove_item boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop);
  perform 1 from public.barberflow_schedule a where a.establishment_id=shop and a.id=appointment
    and a.kind='appointment' and a.state in ('scheduled','completed') for update;
  if not found or exists(select 1 from public.barberflow_receipts r where r.appointment_id=appointment) then return false; end if;
  if remove_item then
    delete from public.barberflow_order_services l where l.establishment_id=shop and l.appointment_id=appointment and l.service_id=service;
  else
    insert into public.barberflow_order_services(establishment_id,appointment_id,service_id,service_name,price_cents)
    select shop,appointment,s.id,s.name,s.price_cents from public.barberflow_services s
    where s.establishment_id=shop and s.id=service and s.active and s.deleted_at is null
    on conflict do nothing;
  end if;
  return found;
end;
$$;
revoke all on function public.barberflow_set_order_service(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.barberflow_set_order_service(uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.barberflow_save_counter_sale(shop_id uuid, sale_id uuid, expected_revision integer, customer text,
  contact text, selections jsonb, operation text, payment_method text, payment_reference text, received_cents integer default null)
returns text language plpgsql security definer set search_path='' as $$
declare
  current_sale barberflow_private.counter_sales%rowtype;
  item jsonb; previous jsonb; snapshot jsonb:='[]'; record_item record;
  kind text; item_id uuid; units integer; item_name text; price integer;
  service_total bigint:=0; product_total bigint:=0;
  yr integer;
  candidate integer;
  pix_settings jsonb;
begin
  if barberflow_private.counter_allowed(shop_id) is not true then return 'denied'; end if;
  yr:=extract(year from now() at time zone barberflow_private.counter_timezone(shop_id));
  if sale_id is null or expected_revision is null or operation is null or operation not in ('save','charge','confirm','cancel') then return 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sale_id::text,0));
  select * into current_sale from barberflow_private.counter_sales where id=sale_id and shop=shop_id for update;
  if found then
    if operation='confirm' and current_sale.state='paid' and upper(current_sale.reference)=upper(btrim(payment_reference))
      and received_cents=current_sale.service_cents+current_sale.product_cents then return 'ok'; end if;
    if operation='cancel' and current_sale.state='cancelled' then return 'ok'; end if;
    if operation in ('save','charge') and expected_revision=0 then return 'ok'; end if;
    if current_sale.revision<>expected_revision then return 'changed'; end if;
  elsif expected_revision<>0 or operation in ('confirm','cancel') then return 'changed';
  end if;

  if operation='confirm' then
    if current_sale.state<>'pending' or payment_reference is null or char_length(btrim(payment_reference)) not between 6 and 100 then return 'invalid'; end if;
    if received_cents is distinct from current_sale.service_cents+current_sale.product_cents then return 'amount'; end if;
    update barberflow_private.counter_sales set state='paid',paid_at=now(),reference=btrim(payment_reference),revision=revision+1 where id=sale_id;
    insert into barberflow_private.finance_entries(id,establishment_id,direction,description,category,due_on,amount_cents,created_by)
      values(sale_id,shop_id,'in','Comanda '||current_sale.number,'Comandas avulsas',
        (now() at time zone barberflow_private.counter_timezone(shop_id))::date,current_sale.service_cents+current_sale.product_cents,auth.uid());
    insert into barberflow_private.finance_settlements(id,entry_id,amount_cents,recorded_by)
      values(sale_id,sale_id,current_sale.service_cents+current_sale.product_cents,auth.uid());
    return 'ok';
  end if;
  if operation='cancel' then
    if current_sale.state not in ('open','pending') then return 'changed'; end if;
    if current_sale.state='pending' then
      for item in select value from jsonb_array_elements(current_sale.items) where value->>'kind'='product' order by value->>'id'
      loop
        item_id:=(item->>'id')::uuid; units:=(item->>'units')::integer;
        update public.barberflow_products set stock=stock+units where establishment_id=shop_id and id=item_id;
        insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
          values(shop_id,item_id,units,'Cancelamento da comanda '||current_sale.number,auth.uid());
      end loop;
    end if;
    update barberflow_private.counter_sales set state='cancelled',revision=revision+1 where id=sale_id;
    return 'ok';
  end if;
  if current_sale.id is not null and current_sale.state<>'open' then return 'changed'; end if;
  if customer is null or contact is null or char_length(customer)>120 or char_length(contact)>30
    or contact !~ '^[0-9+(). -]*$' or selections is null or jsonb_typeof(selections)<>'array' then return 'invalid'; end if;
  if jsonb_array_length(selections) not between 1 and 8 then return 'invalid'; end if;
  if (select count(*) from jsonb_array_elements(selections) where value->>'kind'='service')>4 or
    (select count(*) from jsonb_array_elements(selections) where value->>'kind'='product')>4 then return 'invalid'; end if;
  if operation='charge' and (payment_method is null or payment_method not in ('pix','debit','credit')) then return 'invalid'; end if;

  for item in select value from jsonb_array_elements(selections) order by value->>'id'
  loop
    kind:=item->>'kind'; item_id:=(item->>'id')::uuid; units:=(item->>'units')::integer;
    if kind is null or kind not in ('service','product') or item_id is null or units is null or units not between 1 and 10000
      or (kind='service' and units<>1)
      or exists(select 1 from jsonb_array_elements(snapshot) where value->>'id'=item_id::text and value->>'kind'=kind) then return 'invalid'; end if;
    select value into previous from jsonb_array_elements(coalesce(current_sale.items,'[]')) where value->>'id'=item_id::text and value->>'kind'=kind;
    if kind='service' then
      select s.name,s.price_cents into record_item from public.barberflow_services s
        where s.establishment_id=shop_id and s.id=item_id and (previous is not null or s.active and s.deleted_at is null);
    else
      select p.name,p.price_cents into record_item from public.barberflow_products p
        where p.establishment_id=shop_id and p.id=item_id and (previous is not null or p.active and p.deleted_at is null);
    end if;
    if not found then return 'invalid'; end if;
    item_name:=coalesce(previous->>'name',record_item.name);
    price:=coalesce((previous->>'price')::integer,record_item.price_cents);
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('kind',kind,'id',item_id,'units',units,'name',item_name,'price',price));
    if kind='service' then service_total:=service_total+price;
    else product_total:=product_total+price::bigint*units; end if;
  end loop;
  if service_total+product_total>99999999 or (operation='charge' and service_total+product_total<=0) then return 'invalid'; end if;
  if operation='charge' and payment_method='pix' then
    select to_jsonb(p)-'establishment_id' into pix_settings from public.barberflow_showcase_pix p where p.establishment_id=shop_id;
    if not found then return 'pix_missing'; end if;
  end if;

  if current_sale.id is null then
    candidate:=barberflow_private.next_comanda_number(shop_id,yr);
    if candidate is null then return 'limit'; end if;
    insert into barberflow_private.counter_sales(id,shop,sale_year,sequence_number,client_name,phone,items,service_cents,product_cents,state)
      values(sale_id,shop_id,yr,candidate,btrim(customer),btrim(contact),snapshot,service_total,product_total,'open')
      returning * into current_sale;
  end if;
  if operation='charge' then
    for item in select value from jsonb_array_elements(snapshot) where value->>'kind'='product' order by value->>'id'
    loop
      item_id:=(item->>'id')::uuid; units:=(item->>'units')::integer;
      perform 1 from public.barberflow_products where establishment_id=shop_id and id=item_id for update;
      update public.barberflow_products set stock=stock-units where establishment_id=shop_id and id=item_id and active and deleted_at is null
        and (expires_on is null or expires_on>=(now() at time zone barberflow_private.counter_timezone(shop_id))::date)
        and stock-barberflow_private.showcase_held(item_id)>=units;
      if not found then raise exception using errcode='BF001',message='Stock unavailable'; end if;
      insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
        values(shop_id,item_id,-units,'Reserva da comanda '||current_sale.number,auth.uid());
    end loop;
  end if;
  update barberflow_private.counter_sales set client_name=btrim(customer),phone=btrim(contact),items=snapshot,
    service_cents=service_total,product_cents=product_total,revision=revision+1,
    state=case when operation='charge' then 'pending' else 'open' end,
    method=case when operation='charge' then payment_method end,pix=pix_settings
    where id=sale_id and shop=shop_id;
  return 'ok';
exception when invalid_text_representation or numeric_value_out_of_range then return 'invalid';
  when unique_violation then return 'duplicate';
  when sqlstate 'BF001' then return 'stock';
end;
$$;

create or replace function public.barberflow_close_order(shop uuid, appointment uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; booked record; line record; subtotal bigint := 0; result bigint; service_total bigint;
begin
  perform barberflow_private.require_inventory_owner(shop);
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
      coalesce(n.number,upper(left(r.appointment_id::text,8))) as number,
      r.closed_at as closed,case when (a.booked_by is not null or a.guest_online) then 'online' else 'porta' end as origin,
      jsonb_build_array(jsonb_build_object('name',a.service_name,'kind','service','units',1,'price',r.service_cents-extra.cents)) || extra.items
        || coalesce((select jsonb_agg(jsonb_build_object('name',l.product_name,'kind','product','units',l.quantity,'price',l.unit_price_cents) order by l.product_id)
          from public.barberflow_order_products l where l.appointment_id=r.appointment_id and l.establishment_id=shop_id),'[]') as items,
      round(r.service_cents::numeric*r.commission_bps/10000) as service_commission,
      case when r.products_cents=0 then 0 else round(r.products_cents::numeric*r.product_commission_bps/10000) end as product_commission
    from public.barberflow_receipts r
    join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=r.establishment_id
    left join barberflow_private.appointment_order_numbers n on n.appointment_id=r.appointment_id
    cross join lateral (
      select coalesce(sum(s.price_cents),0) as cents,
        coalesce(jsonb_agg(jsonb_build_object('name',s.service_name,'kind','service','units',1,'price',s.price_cents) order by s.service_id),'[]') as items
      from public.barberflow_order_services s where s.appointment_id=r.appointment_id
    ) extra
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

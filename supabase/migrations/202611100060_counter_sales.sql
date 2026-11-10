-- Keep recorded sales, stock movements and settlements on application rollback.
-- Pending charges can still be confirmed or cancelled through this RPC by the shop owner.
create table barberflow_private.counter_sale_numbers (
  shop uuid primary key references public.barberflow_establishments(id) on delete cascade,
  last_number integer not null default 0
);
create table barberflow_private.counter_sales (
  id uuid primary key,
  shop uuid not null references public.barberflow_establishments(id),
  sale_year integer not null,
  sequence_number integer not null check(sequence_number between 1 and 999999),
  number text generated always as (substr(lpad(sequence_number::text,6,'0'),1,3)||'.'||right(lpad(sequence_number::text,6,'0'),3)||'.'||sale_year::text) stored,
  unique(shop,sale_year,sequence_number),
  client_name text not null,
  phone text not null,
  items jsonb not null,
  service_cents bigint not null,
  product_cents bigint not null,
  state text not null check(state in ('open','pending','paid','cancelled')),
  revision integer not null default 1,
  method text check(method in ('pix','debit','credit')),
  pix jsonb,
  reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index counter_sales_shop_state on barberflow_private.counter_sales(shop,state,created_at desc,id);
create index counter_sales_shop_paid on barberflow_private.counter_sales(shop,paid_at,id) where state='paid';
create unique index counter_sales_reference on barberflow_private.counter_sales(shop,(case when method='pix' then 'pix' else 'card' end),upper(reference)) where reference is not null;
revoke all on barberflow_private.counter_sale_numbers,barberflow_private.counter_sales from public,anon,authenticated;

alter table public.barberflow_establishments add column checkout_timezone text not null default 'America/Sao_Paulo'
  check(checkout_timezone in ('America/Sao_Paulo','America/Manaus','America/Rio_Branco','America/Noronha'));

create function barberflow_private.counter_timezone(shop_id uuid) returns text
language sql stable set search_path='' as $$
  select checkout_timezone from public.barberflow_establishments where id=shop_id;
$$;

create function barberflow_private.counter_allowed(shop_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select barberflow_private.finance_owner(shop_id) and public.barberflow_account_kind()='barbearia'
    and public.barberflow_shop_access_state(shop_id) is distinct from 'blocked';
$$;

create function public.barberflow_save_counter_sale(shop_id uuid, sale_id uuid, expected_revision integer, customer text,
  contact text, selections jsonb, operation text, payment_method text, payment_reference text, received_cents integer default null)
returns text language plpgsql security definer set search_path='' as $$
declare
  current_sale barberflow_private.counter_sales%rowtype;
  item jsonb; previous jsonb; snapshot jsonb:='[]'; record_item record;
  kind text; item_id uuid; units integer; item_name text; price integer;
  service_total bigint:=0; product_total bigint:=0;
  yr integer;
  candidate integer; last_used integer;
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
    insert into barberflow_private.counter_sale_numbers(shop) values(shop_id) on conflict do nothing;
    select last_number into last_used from barberflow_private.counter_sale_numbers where shop=shop_id for update;
    candidate:=last_used%999999+1;
    if exists(select 1 from barberflow_private.counter_sales where shop=shop_id and sale_year=yr and sequence_number=candidate) then
      select available into candidate from generate_series(1,999999) available
      where not exists(select 1 from barberflow_private.counter_sales s where s.shop=shop_id and s.sale_year=yr and s.sequence_number=available)
      order by available limit 1;
      if candidate is null then return 'limit'; end if;
    end if;
    update barberflow_private.counter_sale_numbers set last_number=candidate where shop=shop_id;
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

create function public.barberflow_counter_sale(shop_id uuid, sale_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select to_jsonb(s) from barberflow_private.counter_sales s where s.shop=shop_id and s.id=sale_id
  and barberflow_private.counter_allowed(shop_id);
$$;
create function public.barberflow_counter_open(shop_id uuid, page_number integer) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'count',(select count(*) from barberflow_private.counter_sales where shop=shop_id and state in ('open','pending')),
    'total',(select coalesce(sum(service_cents+product_cents),0) from barberflow_private.counter_sales where shop=shop_id and state in ('open','pending')),
    'rows',coalesce((select jsonb_agg(to_jsonb(s)-'pix' order by s.created_at desc,s.id) from (
      select * from barberflow_private.counter_sales where shop=shop_id and state in ('open','pending')
      order by created_at desc,id limit 16 offset greatest(0,least(page_number,10000))*15) s),'[]'))
  where barberflow_private.counter_allowed(shop_id);
$$;
revoke all on function public.barberflow_save_counter_sale(uuid,uuid,integer,text,text,jsonb,text,text,text,integer),
  public.barberflow_counter_sale(uuid,uuid),public.barberflow_counter_open(uuid,integer) from public,anon;
grant execute on function public.barberflow_save_counter_sale(uuid,uuid,integer,text,text,jsonb,text,text,text,integer),
  public.barberflow_counter_sale(uuid,uuid),public.barberflow_counter_open(uuid,integer) to authenticated;
create function public.barberflow_counter_report(shop_id uuid, period text, item_filter text, page_number integer)
returns jsonb language sql stable security definer set search_path='' as $$
  with today as (select (now() at time zone barberflow_private.counter_timezone(shop_id))::date as day),
  dates as (
    select case period
      when 'semana' then date_trunc('week',day)::date
      when 'quinzena' then date_trunc('month',day)::date+case when extract(day from day)>15 then 15 else 0 end
      when 'mes' then date_trunc('month',day)::date
      when 'trimestre' then date_trunc('quarter',day)::date
      when 'semestre' then make_date(extract(year from day)::integer,case when extract(month from day)<7 then 1 else 7 end,1)
      when 'ano' then date_trunc('year',day)::date else day end as first_day, day+1 as end_day
    from today
  ), paid as (
    select s.*,case item_filter when 'servicos' then s.service_cents when 'produtos' then s.product_cents
      else s.service_cents+s.product_cents end as amount
    from barberflow_private.counter_sales s join barberflow_private.finance_settlements fs on fs.id=s.id and fs.entry_id=s.id
    cross join dates d where s.shop=shop_id and s.state='paid' and fs.reversed_at is null
      and s.paid_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and s.paid_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  ), older_payments as (
    select p.method,
      case item_filter when 'servicos' then round(p.amount_cents::numeric*r.service_cents/nullif(r.total_cents,0))
        when 'produtos' then round(p.amount_cents::numeric*r.products_cents/nullif(r.total_cents,0)) else p.amount_cents end as amount
    from barberflow_private.receipt_payments p join public.barberflow_receipts r on r.appointment_id=p.appointment_id
    cross join dates d where r.establishment_id=shop_id and p.reversed_at is null and p.method in ('pix','card')
      and p.recorded_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and p.recorded_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  ), storefront as (
    select coalesce(sum(o.total_cents),0) as amount,coalesce(sum(o.quantity),0) as units
    from public.barberflow_showcase_orders o cross join dates d
    where o.establishment_id=shop_id and o.status in ('paid','ready','collected')
      and o.paid_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and o.paid_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  ), schedule as (
    select a.state,count(*) as count from public.barberflow_schedule a cross join dates d
    where a.establishment_id=shop_id and a.kind='appointment' and a.state in ('completed','cancelled','no_show','pending')
      and (a.starts_at at time zone 'America/Sao_Paulo')>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and (a.starts_at at time zone 'America/Sao_Paulo')<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id) group by a.state
  ), units as (
    select coalesce(sum((item->>'units')::integer),0) as counter_units from paid
    cross join lateral jsonb_array_elements(paid.items) as item where item->>'kind'='product'
  ), legacy_units as (
    select coalesce(sum(o.quantity),0) as appointment_units
    from public.barberflow_order_products o join public.barberflow_receipts r using (appointment_id,establishment_id)
    cross join dates d where r.establishment_id=shop_id
      and r.closed_at>=d.first_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
      and r.closed_at<d.end_day::timestamp at time zone barberflow_private.counter_timezone(shop_id)
  )
  select jsonb_build_object('first',d.first_day,'last',d.end_day-1,
    'pix',coalesce((select sum(amount) from paid where method='pix'),0)+coalesce((select sum(amount) from older_payments where method='pix'),0)
      +case when item_filter='servicos' then 0 else (select amount from storefront) end,
    'debit',coalesce((select sum(amount) from paid where method='debit'),0),
    'credit',coalesce((select sum(amount) from paid where method='credit'),0),
    'legacy_card',coalesce((select sum(amount) from older_payments where method='card'),0),
    'states',case when item_filter='produtos' then '{}'::jsonb else coalesce((select jsonb_object_agg(state,count) from schedule),'{}') end,
    'units',case when item_filter='servicos' then 0 else (select counter_units from units)+(select appointment_units from legacy_units)+(select units from storefront) end,
    'rows',coalesce((select jsonb_agg(to_jsonb(s)-'pix' order by s.paid_at desc,s.id) from (
      select * from paid where method in ('debit','credit') and amount>0 order by paid_at desc,id
      limit 31 offset greatest(0,least(page_number,10000))*30
    ) s),'[]'))
  from dates d where barberflow_private.counter_allowed(shop_id)
    and period in ('dia','semana','quinzena','mes','trimestre','semestre','ano')
    and item_filter in ('servicos','produtos','ambos');
$$;
revoke all on function public.barberflow_counter_report(uuid,text,text,integer) from public,anon;
grant execute on function public.barberflow_counter_report(uuid,text,text,integer) to authenticated;
grant select(checkout_timezone),update(checkout_timezone) on public.barberflow_establishments to authenticated;

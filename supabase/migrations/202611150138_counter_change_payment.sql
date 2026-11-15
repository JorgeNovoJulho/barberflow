create or replace function public.barberflow_save_counter_sale(shop_id uuid, sale_id uuid, expected_revision integer, customer text,
  contact text, selections jsonb, operation text, payment_method text, payment_reference text, received_cents integer default null)
returns text language plpgsql security definer set search_path='' as $$
declare
  current_sale barberflow_private.counter_sales%rowtype;
  can_manage_shop boolean := barberflow_private.counter_allowed(shop_id) is true;
  actor_professional uuid;

  item jsonb; previous jsonb; snapshot jsonb:='[]'; record_item record;
  kind text; item_id uuid; units integer; item_name text; price integer;
  service_total bigint:=0; product_total bigint:=0;
  yr integer;
  candidate integer;
  pix_settings jsonb;
begin
  if not can_manage_shop then
    actor_professional := barberflow_private.individual_professional(shop_id);
    if actor_professional is null or public.barberflow_shop_access_state(shop_id)='blocked' then return 'denied'; end if;
  end if;
  yr:=extract(year from now() at time zone barberflow_private.counter_timezone(shop_id));
  if sale_id is null or expected_revision is null or operation is null or operation not in ('save','charge','confirm','cancel','change_payment') then return 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sale_id::text,0));
  select * into current_sale from barberflow_private.counter_sales where id=sale_id and shop=shop_id for update;
  if not can_manage_shop and (current_sale.walk_in_professional is distinct from actor_professional or expected_revision=0) then
    return 'denied';
  end if;
  if current_sale.id is not null then
    if operation='confirm' and current_sale.state='paid' and upper(current_sale.reference)=upper(btrim(payment_reference))
      and (received_cents=current_sale.service_cents+current_sale.product_cents
        or (current_sale.method='cash' and received_cents>=current_sale.service_cents+current_sale.product_cents))
      then return 'ok'; end if;
    if operation='cancel' and current_sale.state='cancelled' then return 'ok'; end if;
    if operation in ('save','charge') and expected_revision=0 then return 'ok'; end if;
    if current_sale.revision<>expected_revision then return 'changed'; end if;
  elsif expected_revision<>0 or operation in ('confirm','cancel','change_payment') then return 'changed';
  end if;

  if operation='confirm' then
    if current_sale.state<>'pending' or payment_reference is null or char_length(btrim(payment_reference)) not between 6 and 100 then return 'invalid'; end if;
    if (current_sale.method='cash' and (received_cents is null or received_cents<current_sale.service_cents+current_sale.product_cents))
       or (current_sale.method<>'cash' and received_cents is distinct from current_sale.service_cents+current_sale.product_cents)
    then return 'amount'; end if;
    update barberflow_private.counter_sales set state='paid',paid_at=now(),reference=btrim(payment_reference),revision=revision+1 where id=sale_id;
    insert into barberflow_private.finance_entries(id,establishment_id,direction,description,category,due_on,amount_cents,created_by)
      values(sale_id,shop_id,'in','Comanda '||current_sale.number,'Comandas avulsas',
        (now() at time zone barberflow_private.counter_timezone(shop_id))::date,current_sale.service_cents+current_sale.product_cents,auth.uid());
    insert into barberflow_private.finance_settlements(id,entry_id,amount_cents,recorded_by)
      values(sale_id,sale_id,current_sale.service_cents+current_sale.product_cents,auth.uid());
    return 'ok';
  end if;
  if operation in ('cancel','change_payment') then
    if operation='change_payment' and current_sale.state<>'pending' then return 'changed'; end if;
    if operation='cancel' and not can_manage_shop and (nullif(btrim(payment_reference),'') is null or char_length(payment_reference)>500) then
      return 'invalid';
    end if;
    if current_sale.state not in ('open','pending') then return 'changed'; end if;
    if current_sale.state='pending' then
      for item in select value from jsonb_array_elements(current_sale.items) where value->>'kind'='product' order by value->>'id'
      loop
        item_id:=(item->>'id')::uuid; units:=(item->>'units')::integer;
        update public.barberflow_products set stock=stock+units where establishment_id=shop_id and id=item_id;
        insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
          values(shop_id,item_id,units,(case when operation='change_payment' then 'Alteracao de pagamento da comanda ' else 'Cancelamento da comanda ' end)||current_sale.number,auth.uid());
      end loop;
    end if;
    if operation='change_payment' then
      update barberflow_private.counter_sales set state='open',method=null,pix=null,revision=revision+1
        where id=sale_id and shop=shop_id;
      return 'ok';
    end if;
    update barberflow_private.counter_sales set state='cancelled',revision=revision+1,
      cancellation_reason=case when not can_manage_shop then btrim(payment_reference) end where id=sale_id;
    return 'ok';
  end if;
  if current_sale.id is not null and current_sale.state<>'open' then return 'changed'; end if;
  if nullif(btrim(customer),'') is null or contact is null or contact !~ '[0-9]' or char_length(customer)>120 or char_length(contact)>30
    or contact !~ '^[0-9+(). -]*$' or selections is null or jsonb_typeof(selections)<>'array' then return 'invalid'; end if;
  if jsonb_array_length(selections) not between 1 and 20 then return 'invalid'; end if;
  if (select count(*) from jsonb_array_elements(selections) where value->>'kind'='service')>10 or
    (select count(*) from jsonb_array_elements(selections) where value->>'kind'='product')>10 then return 'invalid'; end if;
  if operation='charge' and (payment_method is null or payment_method not in ('pix','debit','credit','cash')) then return 'invalid'; end if;

  for item in select value from jsonb_array_elements(selections) order by value->>'id'
  loop
    kind:=item->>'kind'; item_id:=(item->>'id')::uuid; units:=(item->>'units')::integer;
    if kind is null or kind not in ('service','product') or item_id is null or units is null or units not between 1 and 10000
      or (kind='service' and units<>1)
      or exists(select 1 from jsonb_array_elements(snapshot) where value->>'id'=item_id::text and value->>'kind'=kind) then return 'invalid'; end if;
    select value into previous from jsonb_array_elements(coalesce(current_sale.items,'[]')) where value->>'id'=item_id::text and value->>'kind'=kind;
    if kind='service' then
      select s.name,s.price_cents into record_item from public.barberflow_services s
        where s.establishment_id=shop_id and s.id=item_id and (previous is not null or s.active and s.deleted_at is null)
          and (can_manage_shop or previous is not null or exists (
            select 1 from public.barberflow_professional_services ps
            where ps.establishment_id=shop_id and ps.professional_id=actor_professional and ps.service_id=s.id
          ));
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

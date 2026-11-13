create function public.barberflow_create_walk_in(shop_id uuid, sale_id uuid, customer text, contact text, selections jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  person uuid := barberflow_private.individual_professional(shop_id);
  item jsonb; snapshot jsonb:='[]'; record_item record;
  kind text; item_id uuid; units integer; item_name text; price integer;
  service_total bigint:=0; product_total bigint:=0;
  yr integer;
  candidate integer;

begin
  if person is null or public.barberflow_shop_access_state(shop_id)='blocked' then return 'denied'; end if;
  yr:=extract(year from now() at time zone barberflow_private.counter_timezone(shop_id));
  if sale_id is null then return 'invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sale_id::text,0));
  perform 1 from barberflow_private.counter_sales where id=sale_id and shop=shop_id for update;
  if found then return 'ok'; end if;
  if nullif(btrim(customer),'') is null or contact is null or contact !~ '[0-9]' or char_length(customer)>120 or char_length(contact)>30
    or contact !~ '^[0-9+(). -]*$' or selections is null or jsonb_typeof(selections)<>'array' then return 'invalid'; end if;
  if jsonb_array_length(selections) not between 1 and 20 then return 'invalid'; end if;
  if (select count(*) from jsonb_array_elements(selections) where value->>'kind'='service')>10 or
    (select count(*) from jsonb_array_elements(selections) where value->>'kind'='product')>10 then return 'invalid'; end if;

  for item in select value from jsonb_array_elements(selections) order by value->>'id'
  loop
    kind:=item->>'kind'; item_id:=(item->>'id')::uuid; units:=(item->>'units')::integer;
    if kind is null or kind not in ('service','product') or item_id is null or units is null or units not between 1 and 10000
      or (kind='service' and units<>1)
      or exists(select 1 from jsonb_array_elements(snapshot) where value->>'id'=item_id::text and value->>'kind'=kind) then return 'invalid'; end if;
    if kind='service' then
      select s.name,s.price_cents into record_item from public.barberflow_services s
        where s.establishment_id=shop_id and s.id=item_id and s.active and s.deleted_at is null and exists(select 1 from public.barberflow_professional_services ps where ps.establishment_id=shop_id and ps.professional_id=person and ps.service_id=s.id);
    else
      select p.name,p.price_cents into record_item from public.barberflow_products p
        where p.establishment_id=shop_id and p.id=item_id and p.active and p.deleted_at is null and p.stock>=units;
    end if;
    if not found then return 'invalid'; end if;
    item_name:=record_item.name;
    price:=record_item.price_cents;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('kind',kind,'id',item_id,'units',units,'name',item_name,'price',price));
    if kind='service' then service_total:=service_total+price;
    else product_total:=product_total+price::bigint*units; end if;
  end loop;
  if service_total+product_total>99999999 then return 'invalid'; end if;

  candidate:=barberflow_private.next_comanda_number(shop_id,yr);
  if candidate is null then return 'limit'; end if;
  insert into barberflow_private.counter_sales(id,shop,sale_year,sequence_number,client_name,phone,items,service_cents,product_cents,state)
    values(sale_id,shop_id,yr,candidate,btrim(customer),btrim(contact),snapshot,service_total,product_total,'open');
  return 'ok';
end;
$$;
revoke all on function public.barberflow_create_walk_in(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.barberflow_create_walk_in(uuid,uuid,text,text,jsonb) to authenticated;

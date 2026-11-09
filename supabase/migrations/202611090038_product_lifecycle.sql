alter table public.barberflow_products add column deleted_at timestamptz,
  add constraint barberflow_products_deleted_inactive check(deleted_at is null or not active);

drop index public.barberflow_products_sku;
create unique index barberflow_products_sku on public.barberflow_products(establishment_id,lower(sku))
  where sku<>'' and deleted_at is null;

alter policy "Owner edits products" on public.barberflow_products
  using (deleted_at is null and exists(select 1 from public.barberflow_establishments e
    where e.id=establishment_id and e.owner_id=(select auth.uid())))
  with check (deleted_at is null and exists(select 1 from public.barberflow_establishments e
    where e.id=establishment_id and e.owner_id=(select auth.uid())));

create function public.barberflow_set_product_status(shop uuid, product uuid, operation text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop);
  if operation is null or operation not in ('freeze','unfreeze','delete') then return false; end if;
  update public.barberflow_products p
    set active=(operation='unfreeze'),deleted_at=case when operation='delete' then now() end
    where p.establishment_id=shop and p.id=product and p.deleted_at is null;
  return found;
end;
$$;
revoke all on function public.barberflow_set_product_status(uuid,uuid,text) from public,anon;
grant execute on function public.barberflow_set_product_status(uuid,uuid,text) to authenticated;

create or replace function public.barberflow_adjust_stock(shop uuid, product uuid, amount integer, note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop);
  if amount is null or amount=0 or amount not between -1000000 and 1000000 or note is null
    or char_length(btrim(note)) not between 1 and 240 then raise exception using errcode='22023',message='Invalid adjustment'; end if;
  update public.barberflow_products set stock=stock+amount where establishment_id=shop and id=product
    and deleted_at is null and stock+amount between 0 and 1000000;
  if not found then raise exception using errcode='22023',message='Stock unavailable'; end if;
  insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
    values (shop,product,amount,btrim(note),(select auth.uid()));
end;
$$;

create or replace function public.barberflow_set_order_product(shop uuid, appointment uuid, product uuid, units integer)
returns void language plpgsql security definer set search_path='' as $$
declare item record;
begin
  perform barberflow_private.require_inventory_owner(shop);
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
  select name,price_cents into item from public.barberflow_products where establishment_id=shop and id=product and active and deleted_at is null for share;
  if not found then raise exception using errcode='22023',message='Product unavailable',detail='product_inactive'; end if;
  insert into public.barberflow_order_products(establishment_id,appointment_id,product_id,product_name,quantity,unit_price_cents)
    values(shop,appointment,product,item.name,units,item.price_cents)
    on conflict(appointment_id,product_id) do update set quantity=excluded.quantity;
end;
$$;

create or replace function public.barberflow_close_order(shop uuid, appointment uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare booked record; line record; subtotal bigint := 0; result bigint;
begin
  perform barberflow_private.require_inventory_owner(shop);
  select price_cents,state into booked from public.barberflow_schedule
    where establishment_id=shop and id=appointment and kind='appointment' for update;
  if not found or booked.state<>'completed' then raise exception using errcode='22023',message='Complete the appointment before closing'; end if;
  select total_cents into result from public.barberflow_receipts where establishment_id=shop and appointment_id=appointment;
  if found then return result; end if;

  for line in select * from public.barberflow_order_products
    where establishment_id=shop and appointment_id=appointment order by product_id loop
    update public.barberflow_products set stock=stock-line.quantity
      where establishment_id=shop and id=line.product_id and active and deleted_at is null and stock>=line.quantity;
    if not found then raise exception using errcode='22023',message='Insufficient stock'; end if;
    insert into public.barberflow_stock_movements(establishment_id,product_id,appointment_id,delta,reason,actor_id)
      values(shop,line.product_id,appointment,-line.quantity,'Venda na comanda',(select auth.uid()));
    subtotal := subtotal+line.quantity::bigint*line.unit_price_cents;
  end loop;
  insert into public.barberflow_receipts(appointment_id,establishment_id,service_cents,products_cents)
    values(appointment,shop,booked.price_cents,subtotal) returning total_cents into result;
  return result;
end;
$$;

create or replace function public.barberflow_owns_product_media(object_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select cardinality(string_to_array(object_name,'/'))=3
    and split_part(object_name,'/',3) in ('foto-1','foto-2','foto-3','foto-4','foto-5','video')
    and exists(select 1 from public.barberflow_products p
      join public.barberflow_establishments e on e.id=p.establishment_id
      where e.owner_id=(select auth.uid()) and e.id::text=split_part(object_name,'/',1)
        and p.id::text=split_part(object_name,'/',2) and p.deleted_at is null);
$$;

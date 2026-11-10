alter table public.barberflow_showcase_orders add column asaas_pix boolean not null default false;
alter table public.barberflow_showcase_pix add column asaas_enabled boolean not null default false;

revoke insert,update on public.barberflow_showcase_pix from authenticated;
grant insert(establishment_id,pix_key,merchant,city),update(pix_key,merchant,city)
  on public.barberflow_showcase_pix to authenticated;

create function barberflow_private.reset_showcase_asaas_on_key_change() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.pix_key is distinct from old.pix_key then new.asaas_enabled := false; end if;
  return new;
end;
$$;
create trigger barberflow_reset_showcase_asaas_key before update of pix_key on public.barberflow_showcase_pix
for each row execute function barberflow_private.reset_showcase_asaas_on_key_change();

create function barberflow_private.reset_showcase_asaas_on_account_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.barberflow_showcase_pix set asaas_enabled=false where establishment_id=old.shop_id and asaas_enabled;
  return null;
end;
$$;
create trigger barberflow_reset_showcase_asaas_account after update or delete on barberflow_private.card_accounts
for each row execute function barberflow_private.reset_showcase_asaas_on_account_change();

create table public.barberflow_showcase_asaas (
  order_id uuid primary key references public.barberflow_showcase_orders(id) on delete cascade,
  sealed_token text not null,
  claimed_at timestamptz,
  qr_id text unique,
  payload text,
  check ((qr_id is null) = (payload is null))
);
alter table public.barberflow_showcase_asaas enable row level security;
revoke all on public.barberflow_showcase_asaas from public,anon,authenticated;
grant select,update on public.barberflow_showcase_asaas to service_role;

create function public.barberflow_enable_showcase_asaas(shop uuid, enabled boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop);
  if public.barberflow_finance_status(shop) is distinct from 'unlocked' then return false; end if;
  if enabled and not exists(select 1 from barberflow_private.card_accounts
    where shop_id=shop and not sandbox and sealed_token like 'asaas.%') then return false; end if;
  update public.barberflow_showcase_pix set asaas_enabled=enabled where establishment_id=shop;
  return found;
end;
$$;

create function barberflow_private.mark_showcase_asaas() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.asaas_pix := exists(select 1 from public.barberflow_showcase_pix
    where establishment_id=new.establishment_id and asaas_enabled)
    and exists(select 1 from barberflow_private.card_accounts
      where shop_id=new.establishment_id and not sandbox and sealed_token like 'asaas.%');
  return new;
end;
$$;
create trigger barberflow_mark_showcase_asaas before insert on public.barberflow_showcase_orders
for each row execute function barberflow_private.mark_showcase_asaas();

create function barberflow_private.prepare_showcase_asaas() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.asaas_pix then
    insert into public.barberflow_showcase_asaas(order_id,sealed_token)
      select new.id,sealed_token from barberflow_private.card_accounts
      where shop_id=new.establishment_id and not sandbox and sealed_token like 'asaas.%';
    if not found then raise exception using errcode='22023',message='Asaas unavailable'; end if;
  end if;
  return new;
end;
$$;
create trigger barberflow_prepare_showcase_asaas after insert on public.barberflow_showcase_orders
for each row execute function barberflow_private.prepare_showcase_asaas();

create function barberflow_private.update_showcase_order(shop uuid, order_id uuid, operation text, received_cents integer,
  reference text, actor uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare
  purchase record; entry uuid:=gen_random_uuid();
begin
  select * into purchase from public.barberflow_showcase_orders o
    where o.id=order_id and o.establishment_id=shop for update;
  if not found then return false; end if;
  if operation='confirm' and purchase.status='pending' then
    if received_cents is distinct from purchase.total_cents or reference is null
      or char_length(btrim(reference)) not between 6 and 100 then return false; end if;
    perform 1 from public.barberflow_products p where p.id=purchase.product_id for update;
    update public.barberflow_showcase_orders set status='paid',paid_at=now(),bank_reference=btrim(reference) where id=order_id;
    update public.barberflow_products p set stock=p.stock-purchase.quantity
      where p.id=purchase.product_id and p.stock>=purchase.quantity and p.deleted_at is null
        and (p.expires_on is null or p.expires_on>=(now() at time zone 'America/Sao_Paulo')::date);
    if not found then raise exception using errcode='22023',message='Stock unavailable'; end if;
    insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
      values(shop,purchase.product_id,-purchase.quantity,'Venda Pix na vitrine',actor);
    insert into barberflow_private.finance_entries(id,establishment_id,direction,description,category,due_on,amount_cents,created_by)
      values(entry,shop,'in','Vitrine Pix: '||purchase.product_name,'Vendas da vitrine',
        (now() at time zone 'America/Sao_Paulo')::date,purchase.total_cents,actor);
    insert into barberflow_private.finance_settlements(id,entry_id,amount_cents,recorded_by)
      values(gen_random_uuid(),entry,purchase.total_cents,actor);
    return true;
  elsif operation='read' and purchase.status<>'pending' then
    update public.barberflow_showcase_orders set read_at=coalesce(read_at,now()) where id=order_id;
    return true;
  elsif (operation='ready' and purchase.status='paid') or (operation='collected' and purchase.status='ready') then
    update public.barberflow_showcase_orders set status=operation,read_at=coalesce(read_at,now()) where id=order_id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.barberflow_update_showcase_order(shop uuid, order_id uuid, operation text, received_cents integer,
  reference text) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop);
  return barberflow_private.update_showcase_order(shop,order_id,operation,received_cents,reference,(select auth.uid()));
end;
$$;

create function public.barberflow_settle_showcase_asaas(qr text, payment text, cents integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare purchase record;
begin
  select o.id,o.establishment_id,o.status,o.total_cents,o.bank_reference,e.owner_id into purchase
  from public.barberflow_showcase_asaas a
  join public.barberflow_showcase_orders o on o.id=a.order_id
  join public.barberflow_establishments e on e.id=o.establishment_id
  where a.qr_id=qr for update of o;
  if not found or cents is distinct from purchase.total_cents then return false; end if;
  if purchase.status<>'pending' then return true; end if;
  return barberflow_private.update_showcase_order(purchase.establishment_id,purchase.id,'confirm',cents,'asaas:'||payment,purchase.owner_id);
end;
$$;

revoke all on function barberflow_private.mark_showcase_asaas(),barberflow_private.prepare_showcase_asaas(),
  barberflow_private.reset_showcase_asaas_on_key_change(),barberflow_private.reset_showcase_asaas_on_account_change(),
  barberflow_private.update_showcase_order(uuid,uuid,text,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.barberflow_enable_showcase_asaas(uuid,boolean),public.barberflow_settle_showcase_asaas(text,text,integer)
  from public,anon,authenticated;
grant execute on function public.barberflow_enable_showcase_asaas(uuid,boolean) to authenticated;
grant execute on function public.barberflow_settle_showcase_asaas(text,text,integer) to service_role;

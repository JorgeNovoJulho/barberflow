alter table public.barberflow_showcase_orders drop constraint barberflow_showcase_orders_status_check;
alter table public.barberflow_showcase_orders
  add constraint barberflow_showcase_orders_status_check check (status in ('pending','paid','ready','collected','denied')),
  add column denied_at timestamptz,
  add column counter_number text,
  add column notice_at timestamptz generated always as (coalesce(denied_at,paid_at,created_at)) stored;

create function public.barberflow_deny_showcase_order(shop uuid, order_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase record; charge record;
begin
  perform barberflow_private.require_inventory_owner(shop);
  select o.id,o.asaas_pix into purchase from public.barberflow_showcase_orders o
  where o.id=order_id and o.establishment_id=shop and o.status='pending' for update;
  if not found then return false; end if;
  if purchase.asaas_pix then
    select * into charge from public.barberflow_showcase_asaas a where a.order_id=purchase.id for update;
    if not found or charge.claimed_at is not null or charge.qr_id is not null then return false; end if;
    delete from public.barberflow_showcase_asaas a where a.order_id=purchase.id;
  end if;
  update public.barberflow_showcase_orders set status='denied',denied_at=now() where id=purchase.id;
  return true;
end;
$$;

create function public.barberflow_link_showcase_counter(shop_id uuid, order_id uuid, counter text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform barberflow_private.require_inventory_owner(shop_id);
  if counter is not null and not exists(
    select 1 from barberflow_private.counter_sales s where s.shop=shop_id and s.number=counter
  ) then return false; end if;
  update public.barberflow_showcase_orders o set counter_number=counter
  where o.id=order_id and o.establishment_id=shop_id and o.status<>'denied';
  return found;
end;
$$;

revoke all on function public.barberflow_deny_showcase_order(uuid,uuid),public.barberflow_link_showcase_counter(uuid,uuid,text) from public,anon;
grant execute on function public.barberflow_deny_showcase_order(uuid,uuid),public.barberflow_link_showcase_counter(uuid,uuid,text) to authenticated;

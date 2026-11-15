alter table barberflow_private.team_access add column manage_products boolean not null default false;

create function public.barberflow_team_can_manage_products(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.barberflow_shop_access_state(shop) is distinct from 'blocked'
    and exists(select 1 from barberflow_private.team_access t
      where t.establishment_id=shop and t.user_id=auth.uid() and t.accepted_at is not null
        and t.revoked_at is null and t.manage_products
        and t.professional_id=barberflow_private.individual_professional(shop));
$$;
revoke all on function public.barberflow_team_can_manage_products(uuid) from public,anon;
grant execute on function public.barberflow_team_can_manage_products(uuid) to authenticated;

create policy "Team reads delegated products" on public.barberflow_products for select to authenticated
  using (public.barberflow_team_can_manage_products(establishment_id));
create policy "Team edits delegated products" on public.barberflow_products for update to authenticated
  using (public.barberflow_team_can_manage_products(establishment_id) and deleted_at is null)
  with check (public.barberflow_team_can_manage_products(establishment_id) and deleted_at is null);
create policy "Team reads delegated stock movements" on public.barberflow_stock_movements for select to authenticated
  using (public.barberflow_team_can_manage_products(establishment_id));

create or replace function public.barberflow_create_priced_product(shop uuid, product_name text, product_sku text, sale_price integer,
  unit_cost integer, stock_floor integer, expiry date, initial_units integer, product_barcode text, product_description text,
  in_showcase boolean, tier text)
returns uuid language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
  if not public.barberflow_team_can_manage_products(shop) then
    perform barberflow_private.require_inventory_owner(shop);
  end if;
  created:=public.barberflow_create_product(shop,product_name,product_sku,sale_price,unit_cost,stock_floor,expiry,
    initial_units,product_barcode,product_description,in_showcase);
  if tier is not null then
    update public.barberflow_products set margin_tier=tier where id=created and establishment_id=shop;
  end if;
  return created;
end;
$$;

create or replace function public.barberflow_adjust_stock(shop uuid, product uuid, amount integer, note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_team_can_manage_products(shop) then
    perform barberflow_private.require_inventory_owner(shop);
  end if;
  if amount is null or amount=0 or amount not between -1000000 and 1000000 or note is null
    or char_length(btrim(note)) not between 1 and 240 then raise exception using errcode='22023',message='Invalid adjustment'; end if;
  update public.barberflow_products set stock=stock+amount where establishment_id=shop and id=product
    and deleted_at is null and stock+amount between 0 and 1000000;
  if not found then raise exception using errcode='22023',message='Stock unavailable'; end if;
  insert into public.barberflow_stock_movements(establishment_id,product_id,delta,reason,actor_id)
    values (shop,product,amount,btrim(note),(select auth.uid()));
end;
$$;

create function public.barberflow_team_members_with_stock(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,manage_clients boolean,manage_services boolean,manage_professionals boolean,read_finance boolean,expires_at timestamptz,accepted_at timestamptz,manage_products boolean)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.manage_clients,t.manage_services,t.manage_professionals,t.read_finance,t.expires_at,t.accepted_at,t.manage_products
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;
revoke all on function public.barberflow_team_members_with_stock(uuid) from public,anon;
grant execute on function public.barberflow_team_members_with_stock(uuid) to authenticated;

create function public.barberflow_update_team_permissions_with_stock(shop uuid, person uuid, member uuid,
  see_agendas boolean, manage_agendas boolean, edit_clients boolean, edit_services boolean,
  edit_professionals boolean, view_finance boolean, edit_products boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update barberflow_private.team_access t
    set see_all=coalesce(see_agendas,false) or coalesce(manage_agendas,false),
        manage_all=coalesce(manage_agendas,false),
        manage_clients=coalesce(edit_clients,false),
        manage_services=coalesce(edit_services,false),
        manage_professionals=coalesce(edit_professionals,false),
        read_finance=coalesce(view_finance,false),
        manage_products=coalesce(edit_products,false)
  where t.id=member and t.establishment_id=shop and t.professional_id=person
    and t.accepted_at is not null and t.revoked_at is null and t.user_id is not null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid());
  if not found then return false; end if;
  if view_finance is not true then
    delete from barberflow_private.team_finance_sessions s where s.member_id=member;
  end if;
  return true;
end;
$$;
revoke all on function public.barberflow_update_team_permissions_with_stock(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.barberflow_update_team_permissions_with_stock(uuid,uuid,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

create function public.barberflow_team_pickups(shop uuid)
returns table(id uuid, order_number bigint, buyer_name text, product_name text, quantity integer, status text)
language sql stable security definer set search_path='' as $$
  select o.id,o.order_number::bigint,o.buyer_name,o.product_name,o.quantity,o.status
  from public.barberflow_showcase_orders o
  where o.establishment_id=shop and o.status in ('paid','ready')
    and public.barberflow_team_can_manage_products(shop)
  order by o.created_at,o.id;
$$;

create function public.barberflow_team_update_pickup(shop uuid, order_id uuid, operation text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_team_can_manage_products(shop)
    or operation is null or operation not in ('ready','collected') then return false; end if;
  return barberflow_private.update_showcase_order(shop,order_id,operation,null,null,auth.uid());
end;
$$;
revoke all on function public.barberflow_team_pickups(uuid), public.barberflow_team_update_pickup(uuid,uuid,text) from public,anon;
grant execute on function public.barberflow_team_pickups(uuid), public.barberflow_team_update_pickup(uuid,uuid,text) to authenticated;

create function public.barberflow_save_registered_counter_sale(shop_id uuid, sale_id uuid, expected_revision integer,
  selected_client uuid, selections jsonb, operation text, payment_method text)
returns text language plpgsql security definer set search_path='' as $$
declare customer record; sale barberflow_private.counter_sales%rowtype; result text;
begin
  if operation is null or operation not in ('save','charge') then return 'invalid'; end if;
  if not (coalesce(barberflow_private.counter_allowed(shop_id),false)
    or (barberflow_private.individual_professional(shop_id) is not null
      and public.barberflow_team_can_edit_clients(shop_id))) then return 'denied'; end if;
  select c.name,c.phone into customer from public.barberflow_clients c
    where c.establishment_id=shop_id and c.id=selected_client and c.active for share;
  if not found then return 'invalid_client'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sale_id::text,0));
  select s.* into sale from barberflow_private.counter_sales s where s.shop=shop_id and s.id=sale_id for update;
  if found and (sale.state<>'open' or sale.revision is distinct from expected_revision) then return 'changed'; end if;
  result := public.barberflow_save_counter_sale(shop_id,sale_id,expected_revision,customer.name,customer.phone,selections,operation,payment_method,null,null);
  if result='ok' then
    update barberflow_private.counter_sales s set client_id=selected_client where s.shop=shop_id and s.id=sale_id;
  end if;
  return result;
end;
$$;
revoke all on function public.barberflow_save_registered_counter_sale(uuid,uuid,integer,uuid,jsonb,text,text) from public,anon;
grant execute on function public.barberflow_save_registered_counter_sale(uuid,uuid,integer,uuid,jsonb,text,text) to authenticated;

create function public.barberflow_my_open_walk_in_count(shop_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select count(*)
  from barberflow_private.counter_sales s
  where s.shop=shop_id and s.state in ('open','pending')
    and s.walk_in_professional=barberflow_private.individual_professional(shop_id);
$$;
revoke all on function public.barberflow_my_open_walk_in_count(uuid) from public,anon;
grant execute on function public.barberflow_my_open_walk_in_count(uuid) to authenticated;

drop function public.barberflow_my_walk_ins(uuid);

create function public.barberflow_my_walk_ins(shop_id uuid)
returns table(id uuid, number text, customer text, state text, total bigint, items jsonb)
language sql stable security definer set search_path='' as $$
  select s.id,s.number,s.client_name,s.state,(s.service_cents+s.product_cents)::bigint,s.items
  from barberflow_private.counter_sales s
  where s.shop=shop_id and s.walk_in_professional=barberflow_private.individual_professional(shop_id)
  order by s.created_at desc,s.id limit 100;
$$;
revoke all on function public.barberflow_my_walk_ins(uuid) from public,anon;
grant execute on function public.barberflow_my_walk_ins(uuid) to authenticated;

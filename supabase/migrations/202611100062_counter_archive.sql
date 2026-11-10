create function public.barberflow_counter_archive(shop_id uuid, page_number integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(s)-'pix' order by s.paid_at desc,s.id),'[]')
  from (
    select sale.* from barberflow_private.counter_sales sale
    where sale.shop=shop_id and sale.state='paid' and barberflow_private.counter_allowed(shop_id)
    order by sale.paid_at desc,sale.id
    limit 16 offset greatest(0,least(coalesce(page_number,0),10000))*15
  ) s;
$$;
revoke all on function public.barberflow_counter_archive(uuid,integer) from public,anon;
grant execute on function public.barberflow_counter_archive(uuid,integer) to authenticated;

create function public.barberflow_card_controls(shop uuid)
returns table(receipt_id uuid,payment_id uuid)
language sql stable security definer set search_path='' as $$
  select c.receipt_id,case when c.status='paid' then c.id end
  from barberflow_private.card_charges c
  where c.shop_id=shop and c.status in ('open','paid') and barberflow_private.finance_unlocked(shop);
$$;
revoke all on function public.barberflow_card_controls(uuid) from public,anon;
grant execute on function public.barberflow_card_controls(uuid) to authenticated;

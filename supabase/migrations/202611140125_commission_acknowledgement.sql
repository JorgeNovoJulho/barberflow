alter table barberflow_private.commission_receipts add column acknowledged_at timestamptz;

create function public.barberflow_my_commission_receipts(shop_id uuid)
returns table(id uuid, issued_at timestamptz, amount bigint, acknowledged_at timestamptz)
language sql stable security definer set search_path='' as $$
  select r.id,r.issued_at,(r.document->>'amount')::bigint,r.acknowledged_at
  from barberflow_private.commission_receipts r
  where r.shop=shop_id and r.professional=barberflow_private.individual_professional(shop_id)
  order by r.issued_at desc,r.id limit 50;
$$;

create function public.barberflow_acknowledge_commission(shop_id uuid, receipt uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update barberflow_private.commission_receipts r
    set acknowledged_at=coalesce(r.acknowledged_at,now())
    where r.id=receipt and r.shop=shop_id
      and r.professional=barberflow_private.individual_professional(shop_id);
  return found;
end;
$$;
revoke all on function public.barberflow_my_commission_receipts(uuid),
  public.barberflow_acknowledge_commission(uuid,uuid) from public,anon;
grant execute on function public.barberflow_my_commission_receipts(uuid),
  public.barberflow_acknowledge_commission(uuid,uuid) to authenticated;

create function public.barberflow_professional_shop_has_services(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_services s
    where s.establishment_id=shop and s.active and s.deleted_at is null)
  where barberflow_private.individual_professional(shop) is not null;
$$;
revoke all on function public.barberflow_professional_shop_has_services(uuid) from public,anon;
grant execute on function public.barberflow_professional_shop_has_services(uuid) to authenticated;

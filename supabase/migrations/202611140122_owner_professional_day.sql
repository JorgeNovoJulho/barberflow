create function public.barberflow_owner_set_professional_day(shop_id uuid, person uuid, available_now boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if available_now is null or not exists (
    select 1 from public.barberflow_establishments e
    join public.barberflow_professionals p on p.establishment_id=e.id
    where e.id=shop_id and e.owner_id=auth.uid() and p.id=person and p.active
  ) then return false; end if;

  insert into barberflow_private.professional_day as d (shop,professional,day,available,started_at)
    values(shop_id,person,(now() at time zone 'America/Sao_Paulo')::date,
      available_now,case when available_now then now() end)
  on conflict(shop,professional,day) do update set available=excluded.available,
    started_at=case when excluded.available and d.available then coalesce(d.started_at,excluded.started_at)
                    else excluded.started_at end;
  return true;
end;
$$;
revoke all on function public.barberflow_owner_set_professional_day(uuid,uuid,boolean) from public,anon;
grant execute on function public.barberflow_owner_set_professional_day(uuid,uuid,boolean) to authenticated;

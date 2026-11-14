create table barberflow_private.professional_payout_settings (
  shop uuid not null,
  professional uuid not null,
  cadence text not null check (cadence in ('daily','weekly','fortnightly','monthly')),
  first_day integer,
  second_day integer,
  pix_key text not null check (char_length(pix_key) between 1 and 77),
  beneficiary text not null check (char_length(beneficiary) between 1 and 120),
  city text not null check (char_length(city) between 1 and 100),
  primary key(shop,professional),
  foreign key(shop,professional) references public.barberflow_professionals(establishment_id,id) on delete cascade,
  check (coalesce(case cadence
    when 'daily' then first_day is null and second_day is null
    when 'weekly' then first_day between 1 and 6 and second_day is null
    when 'fortnightly' then first_day between 1 and 15 and second_day between 16 and 31
    when 'monthly' then first_day between 1 and 31 and second_day is null
  end,false))
);
alter table barberflow_private.professional_payout_settings enable row level security;
revoke all on barberflow_private.professional_payout_settings from public,anon,authenticated;

create function public.barberflow_owner_professional_payouts(shop_id uuid)
returns setof barberflow_private.professional_payout_settings
language sql stable security definer set search_path='' as $$
  select ps.* from barberflow_private.professional_payout_settings ps
  where ps.shop=shop_id and exists(select 1 from public.barberflow_establishments e
    where e.id=shop_id and e.owner_id=auth.uid());
$$;

create function public.barberflow_save_professional_payout(shop_id uuid, person uuid,
  frequency text, day_one integer, day_two integer, key_value text, holder text, holder_city text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.barberflow_establishments e join public.barberflow_professionals p
    on p.establishment_id=e.id where e.id=shop_id and e.owner_id=auth.uid() and p.id=person) then return false; end if;
  insert into barberflow_private.professional_payout_settings
    (shop,professional,cadence,first_day,second_day,pix_key,beneficiary,city)
  values(shop_id,person,frequency,day_one,day_two,key_value,btrim(holder),btrim(holder_city))
  on conflict(shop,professional) do update set cadence=excluded.cadence,first_day=excluded.first_day,
    second_day=excluded.second_day,pix_key=excluded.pix_key,beneficiary=excluded.beneficiary,city=excluded.city;
  return true;
end;
$$;
revoke all on function public.barberflow_owner_professional_payouts(uuid),
  public.barberflow_save_professional_payout(uuid,uuid,text,integer,integer,text,text,text) from public,anon;
grant execute on function public.barberflow_owner_professional_payouts(uuid),
  public.barberflow_save_professional_payout(uuid,uuid,text,integer,integer,text,text,text) to authenticated;

alter table public.barberflow_establishments
  add column slug text unique check (slug is null or (char_length(slug) between 3 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  add column city text not null default '' check (char_length(city) <= 100),
  add column public_description text not null default '' check (char_length(public_description) <= 1200),
  add column published boolean not null default false,
  add check (not published or (slug is not null and char_length(btrim(city)) > 0));

grant update (slug, city, public_description, published) on public.barberflow_establishments to authenticated;

alter table public.barberflow_schedule add column booked_by uuid references auth.users(id) on delete set null;
create index barberflow_schedule_booked_by_idx on public.barberflow_schedule(booked_by, starts_at desc) where booked_by is not null;

create function public.barberflow_public_directory()
returns table(slug text,name text,city text,segment text)
language sql stable security definer set search_path='' as $$
  select e.slug,e.name,e.city,e.segment from public.barberflow_establishments e
  where e.published order by e.name,e.slug;
$$;

create function public.barberflow_public_profile(profile_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'slug',e.slug,'name',e.name,'city',e.city,'segment',e.segment,'description',e.public_description,
    'services',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'category',s.category,
        'price_cents',s.price_cents,'duration_minutes',s.duration_minutes,'professionals',coalesce((
          select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
          from public.barberflow_professional_services ps
          join public.barberflow_professionals p on p.establishment_id=ps.establishment_id and p.id=ps.professional_id
          where ps.establishment_id=e.id and ps.service_id=s.id and p.active
        ),'[]'::jsonb)) order by s.name,s.id)
      from public.barberflow_services s where s.establishment_id=e.id and s.active
    ),'[]'::jsonb)
  ) from public.barberflow_establishments e where e.published and e.slug=profile_slug;
$$;

create function public.barberflow_public_slots(profile_slug text, professional uuid, service uuid, booking_day date)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select candidate.start_at
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join public.barberflow_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from booking_day)
  cross join lateral pg_catalog.generate_series(
    booking_day+h.starts_at, booking_day+h.ends_at-pg_catalog.make_interval(mins=>s.duration_minutes), interval '15 minutes'
  ) candidate(start_at)
  where e.slug=profile_slug and e.published
    and booking_day between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+30
    and candidate.start_at > (now() at time zone 'America/Sao_Paulo')
    and (h.break_start is null or candidate.start_at::time >= h.break_end
      or (candidate.start_at+pg_catalog.make_interval(mins=>s.duration_minutes))::time <= h.break_start)
    and not exists (
      select 1 from public.barberflow_schedule a where a.professional_id=professional and a.establishment_id=e.id
        and a.state in ('scheduled','completed','no_show')
        and tsrange(a.starts_at,a.ends_at,'[)') && tsrange(candidate.start_at,candidate.start_at+pg_catalog.make_interval(mins=>s.duration_minutes),'[)')
    )
  order by candidate.start_at;
$$;

create function public.barberflow_book_online(profile_slug text, professional uuid, service uuid,
  start_at timestamp, customer text, phone text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  buyer uuid := (select auth.uid());
  offering record;
  entry uuid;
begin
  if buyer is null or not exists (select 1 from auth.users where id=buyer and email_confirmed_at is not null) then
    raise exception using errcode='42501', message='Verified account required';
  end if;
  if customer is null or char_length(btrim(customer)) not between 1 and 120 or char_length(phone)>30
    or start_at is null or not isfinite(start_at) then
    raise exception using errcode='22023', message='Invalid booking';
  end if;
  select e.id as shop,s.name,s.price_cents,s.duration_minutes into offering
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join public.barberflow_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from start_at)
  where e.slug=profile_slug and e.published
  for share of e,p,s,ps,h;
  if not found or not exists (select 1 from public.barberflow_public_slots(profile_slug,professional,service,start_at::date) available where available.slot=start_at) then
    raise exception using errcode='22023', message='Slot unavailable';
  end if;
  insert into public.barberflow_schedule
    (establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name,client_phone,booked_by)
  values (offering.shop,professional,service,'appointment',start_at,start_at+pg_catalog.make_interval(mins=>offering.duration_minutes),
    offering.name,offering.price_cents,btrim(customer),nullif(btrim(phone),''),buyer)
  returning id into entry;
  return entry;
end;
$$;

create function public.barberflow_my_bookings()
returns table(id uuid,shop_name text,service_name text,starts_at timestamp,ends_at timestamp,state text,price_cents integer)
language sql stable security definer set search_path='' as $$
  select a.id,e.name,a.service_name,a.starts_at,a.ends_at,a.state,a.price_cents
  from public.barberflow_schedule a join public.barberflow_establishments e on e.id=a.establishment_id
  where a.booked_by=(select auth.uid()) order by a.starts_at desc limit 100;
$$;

revoke all on function public.barberflow_public_directory(),public.barberflow_public_profile(text),public.barberflow_public_slots(text,uuid,uuid,date) from public;
grant execute on function public.barberflow_public_directory(),public.barberflow_public_profile(text),public.barberflow_public_slots(text,uuid,uuid,date) to anon,authenticated;
revoke all on function public.barberflow_book_online(text,uuid,uuid,timestamp,text,text),public.barberflow_my_bookings() from public,anon;
grant execute on function public.barberflow_book_online(text,uuid,uuid,timestamp,text,text),public.barberflow_my_bookings() to authenticated;

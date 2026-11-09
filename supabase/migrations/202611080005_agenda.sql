create extension if not exists btree_gist with schema extensions;

set local search_path = public, extensions, pg_catalog;

create table public.barberflow_schedule (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null,
  professional_id uuid not null,
  service_id uuid,
  kind text not null check (kind in ('appointment','block')),
  state text not null default 'scheduled' check (state in ('scheduled','completed','cancelled','no_show')),
  starts_at timestamp not null,
  ends_at timestamp not null,
  service_name text,
  price_cents integer,
  client_name text,
  client_phone text,
  notes text not null default '' check (char_length(notes) <= 1000),
  foreign key (establishment_id, professional_id) references public.barberflow_professionals(establishment_id, id),
  foreign key (establishment_id, service_id) references public.barberflow_services(establishment_id, id),
  check (starts_at < ends_at),
  check ((kind='appointment' and service_id is not null and service_name is not null and price_cents is not null
      and client_name is not null and char_length(btrim(client_name)) between 1 and 120)
    or (kind='block' and service_id is null and service_name is null and price_cents is null and client_name is null
      and client_phone is null and state in ('scheduled','cancelled'))),
  check (client_phone is null or char_length(client_phone) <= 30),
  exclude using gist (professional_id with =, tsrange(starts_at, ends_at, '[)') with &&)
    where (state in ('scheduled','completed','no_show'))
);
create index barberflow_schedule_shop_start_idx on public.barberflow_schedule (establishment_id, starts_at);

alter table public.barberflow_schedule enable row level security;
revoke all on public.barberflow_schedule from public, anon, authenticated;
grant select on public.barberflow_schedule to authenticated;
create policy "Owners read own schedule" on public.barberflow_schedule for select to authenticated
  using (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));

create function public.barberflow_create_schedule_entry(
  shop uuid, professional uuid, service uuid, start_at timestamp, block_end timestamp,
  customer text, phone text, note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  offering record;
  workday record;
  finish timestamp;
  entry_id uuid;
begin
  if not exists (select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then
    raise exception using errcode='42501', message='Establishment unavailable';
  end if;
  perform 1 from public.barberflow_professionals where establishment_id=shop and id=professional and active for share;
  if not found then raise exception using errcode='22023', message='Professional unavailable'; end if;
  if service is null then
    if block_end is null or start_at >= block_end then raise exception using errcode='22023', message='Invalid block'; end if;
    insert into public.barberflow_schedule (establishment_id,professional_id,kind,starts_at,ends_at,notes)
      values (shop,professional,'block',start_at,block_end,coalesce(note,'')) returning id into entry_id;
  else
    select s.name,s.price_cents,s.duration_minutes into offering from public.barberflow_services s
      join public.barberflow_professional_services ps on ps.establishment_id=s.establishment_id and ps.service_id=s.id
      where s.establishment_id=shop and s.id=service and ps.professional_id=professional and s.active
      for share of s, ps;
    if not found then raise exception using errcode='22023', message='Service unavailable for professional'; end if;
    finish := start_at + pg_catalog.make_interval(mins => offering.duration_minutes);
    select * into workday from public.barberflow_professional_hours
      where establishment_id=shop and professional_id=professional and weekday=extract(dow from start_at)
      for share;
    if not found or start_at::date <> finish::date or start_at::time < workday.starts_at
      or finish::time > workday.ends_at or (workday.break_start is not null
        and start_at::time < workday.break_end and finish::time > workday.break_start) then
      raise exception using errcode='22023', message='Outside working hours';
    end if;
    insert into public.barberflow_schedule
      (establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name,client_phone,notes)
      values (shop,professional,service,'appointment',start_at,finish,offering.name,offering.price_cents,
        btrim(customer),nullif(btrim(phone),''),coalesce(note,'')) returning id into entry_id;
  end if;
  return entry_id;
end;
$$;
revoke all on function public.barberflow_create_schedule_entry(uuid,uuid,uuid,timestamp,timestamp,text,text,text) from public,anon;
grant execute on function public.barberflow_create_schedule_entry(uuid,uuid,uuid,timestamp,timestamp,text,text,text) to authenticated;

create function public.barberflow_set_schedule_state(shop uuid, entry uuid, new_state text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.barberflow_schedule s set state=new_state
    where s.establishment_id=shop and s.id=entry and s.state='scheduled'
      and (new_state='cancelled' or (s.kind='appointment' and new_state in ('completed','no_show')))
      and exists (select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
  return found;
end;
$$;
revoke all on function public.barberflow_set_schedule_state(uuid,uuid,text) from public,anon;
grant execute on function public.barberflow_set_schedule_state(uuid,uuid,text) to authenticated;

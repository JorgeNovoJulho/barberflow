alter table public.barberflow_services
  add constraint barberflow_services_establishment_id_unique unique (establishment_id, id);

create table public.barberflow_professionals (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  active boolean not null default true,
  unique (establishment_id, id)
);

create table public.barberflow_professional_services (
  establishment_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  primary key (establishment_id, professional_id, service_id),
  foreign key (establishment_id, professional_id) references public.barberflow_professionals(establishment_id, id),
  foreign key (establishment_id, service_id) references public.barberflow_services(establishment_id, id)
);

create table public.barberflow_professional_hours (
  establishment_id uuid not null,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  break_start time,
  break_end time,
  primary key (establishment_id, professional_id, weekday),
  foreign key (establishment_id, professional_id) references public.barberflow_professionals(establishment_id, id),
  check (starts_at < ends_at),
  check ((break_start is null and break_end is null) or
    (break_start is not null and break_end is not null and starts_at < break_start and break_start < break_end and break_end < ends_at))
);

do $migration$
declare table_name text;
begin
  foreach table_name in array array['barberflow_professionals','barberflow_professional_services','barberflow_professional_hours'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('create policy "Owner manages professional data" on public.%I to authenticated
      using (exists (select 1 from public.barberflow_establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())))
      with check (exists (select 1 from public.barberflow_establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())))', table_name);
  end loop;
end $migration$;

grant select on public.barberflow_professionals to authenticated;
grant insert (establishment_id, name, description), update (name, description, active)
  on public.barberflow_professionals to authenticated;
grant select, insert, delete on public.barberflow_professional_services to authenticated;
grant select, insert, delete on public.barberflow_professional_hours to authenticated;
grant update (starts_at, ends_at, break_start, break_end) on public.barberflow_professional_hours to authenticated;

create function public.barberflow_set_professional_services(shop uuid, professional uuid, services uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.barberflow_professionals
    where establishment_id=shop and id=professional for update;
  if not found then raise exception 'Professional not found'; end if;
  delete from public.barberflow_professional_services where establishment_id=shop and professional_id=professional;
  insert into public.barberflow_professional_services (establishment_id,professional_id,service_id)
    select shop, professional, id from (select distinct unnest(services) as id) chosen;
end;
$$;
revoke all on function public.barberflow_set_professional_services(uuid,uuid,uuid[]) from public, anon;
grant execute on function public.barberflow_set_professional_services(uuid,uuid,uuid[]) to authenticated;

create function public.barberflow_save_working_day(shop uuid, professional uuid, day smallint,
  opening time, closing time, pause_start time, pause_end time)
returns void language sql security invoker set search_path = '' as $$
  insert into public.barberflow_professional_hours
    (establishment_id,professional_id,weekday,starts_at,ends_at,break_start,break_end)
  values (shop,professional,day,opening,closing,pause_start,pause_end)
  on conflict (establishment_id,professional_id,weekday) do update
  set starts_at=excluded.starts_at, ends_at=excluded.ends_at,
      break_start=excluded.break_start, break_end=excluded.break_end;
$$;
revoke all on function public.barberflow_save_working_day(uuid,uuid,smallint,time,time,time,time) from public, anon;
grant execute on function public.barberflow_save_working_day(uuid,uuid,smallint,time,time,time,time) to authenticated;

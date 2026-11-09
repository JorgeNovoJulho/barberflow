create table public.barberflow_clients (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 30),
  preferences text not null default '' check (char_length(preferences) <= 1000),
  notes text not null default '' check (char_length(notes) <= 1000),
  active boolean not null default true,
  unique(establishment_id,id)
);

alter table public.barberflow_clients enable row level security;
revoke all on public.barberflow_clients from public, anon, authenticated;
grant select on public.barberflow_clients to authenticated;
grant insert (establishment_id,name,phone,preferences,notes),
      update (name,phone,preferences,notes,active) on public.barberflow_clients to authenticated;
create policy "Owners manage clients" on public.barberflow_clients to authenticated
  using (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())))
  with check (exists (select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));

alter table public.barberflow_schedule add column client_id uuid;
alter table public.barberflow_schedule
  add foreign key (establishment_id,client_id) references public.barberflow_clients(establishment_id,id);
create index barberflow_schedule_client_history_idx on public.barberflow_schedule(establishment_id,client_id,starts_at desc)
  where client_id is not null;

create function public.barberflow_book_registered_client(shop uuid, professional uuid, service uuid,
  start_at timestamp, client uuid, note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  person record;
  entry uuid;
begin
  if not exists (select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then
    raise exception using errcode='42501', message='Establishment unavailable';
  end if;
  if service is null then raise exception using errcode='22023', message='Service unavailable'; end if;
  select name,phone into person from public.barberflow_clients
    where establishment_id=shop and id=client and active for share;
  if not found then raise exception using errcode='22023', message='Client unavailable'; end if;
  entry := public.barberflow_create_schedule_entry(shop,professional,service,start_at,null,person.name,person.phone,note);
  update public.barberflow_schedule set client_id=client where id=entry and establishment_id=shop;
  return entry;
end;
$$;
revoke all on function public.barberflow_book_registered_client(uuid,uuid,uuid,timestamp,uuid,text) from public,anon;
grant execute on function public.barberflow_book_registered_client(uuid,uuid,uuid,timestamp,uuid,text) to authenticated;

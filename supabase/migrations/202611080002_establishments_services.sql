create table public.barberflow_establishments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  segment text not null check (segment in (
    'cabelo', 'barbearia', 'esmalteria', 'estetica', 'manicure',
    'trancas', 'massoterapia', 'tatuagem-piercing', 'bronzeamento', 'outro'
  ))
);

create index barberflow_establishments_owner_idx on public.barberflow_establishments (owner_id);

create table public.barberflow_services (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  category text not null default '' check (char_length(category) <= 80),
  price_cents integer not null check (price_cents between 0 and 99999999),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  active boolean not null default true
);

create index barberflow_services_establishment_idx on public.barberflow_services (establishment_id);

alter table public.barberflow_establishments enable row level security;
alter table public.barberflow_services enable row level security;

revoke all on public.barberflow_establishments, public.barberflow_services from public, anon, authenticated;
grant select on public.barberflow_establishments to authenticated;
grant insert (name, segment), update (name, segment) on public.barberflow_establishments to authenticated;
grant select on public.barberflow_services to authenticated;
grant insert (establishment_id, name, description, category, price_cents, duration_minutes),
  update (name, description, category, price_cents, duration_minutes, active)
  on public.barberflow_services to authenticated;

create policy "Owners read own establishments"
  on public.barberflow_establishments for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Owners create own establishments"
  on public.barberflow_establishments for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Owners edit own establishments"
  on public.barberflow_establishments for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners read own services"
  on public.barberflow_services for select to authenticated
  using (exists (select 1 from public.barberflow_establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())));
create policy "Owners create own services"
  on public.barberflow_services for insert to authenticated
  with check (exists (select 1 from public.barberflow_establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())));
create policy "Owners edit own services"
  on public.barberflow_services for update to authenticated
  using (exists (select 1 from public.barberflow_establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.barberflow_establishments e where e.id = establishment_id and e.owner_id = (select auth.uid())));

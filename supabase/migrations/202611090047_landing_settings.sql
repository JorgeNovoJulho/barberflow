create table public.barberflow_landing_settings (
  singleton boolean primary key default true check(singleton),
  appearance jsonb not null default '{}'::jsonb check(jsonb_typeof(appearance)='object' and octet_length(appearance::text)<=12000)
);
insert into public.barberflow_landing_settings default values;
alter table public.barberflow_landing_settings enable row level security;
revoke all on public.barberflow_landing_settings from public,anon,authenticated;
grant select on public.barberflow_landing_settings to anon,authenticated;
grant update(appearance) on public.barberflow_landing_settings to authenticated;
create policy landing_settings_public on public.barberflow_landing_settings for select to anon,authenticated using(true);
create policy landing_settings_master on public.barberflow_landing_settings for update to authenticated
  using((select public.barberflow_is_master())) with check((select public.barberflow_is_master()));

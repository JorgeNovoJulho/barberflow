create table public.barberflow_user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'esmeralda',
  constraint barberflow_theme_allowed check (theme in (
    'esmeralda', 'oceano', 'indigo', 'ametista', 'orquidea',
    'rubi', 'cobre', 'ambar', 'lima', 'grafite'
  ))
);

alter table public.barberflow_user_preferences enable row level security;

revoke all on table public.barberflow_user_preferences from public, anon, authenticated;
grant select, insert, update on table public.barberflow_user_preferences to authenticated;

create policy "Read own preferences"
  on public.barberflow_user_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Insert own preferences"
  on public.barberflow_user_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Update own preferences"
  on public.barberflow_user_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

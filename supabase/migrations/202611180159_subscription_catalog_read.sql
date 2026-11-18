begin;
-- Public prices remain readable by signed-in customers as well as visitors.
grant select(unlimited_monthly_cents,unlimited_yearly_cents)
  on public.barberflow_plan_settings to authenticated;
notify pgrst, 'reload schema';
commit;

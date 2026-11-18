begin;
set local role authenticated;
select monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,
  unlimited_monthly_cents,unlimited_yearly_cents,trial_days
from public.barberflow_plan_settings;
reset role;
set local role anon;
select monthly_cents,yearly_cents,premium_monthly_cents,premium_yearly_cents,
  unlimited_monthly_cents,unlimited_yearly_cents,trial_days
from public.barberflow_plan_settings;
rollback;

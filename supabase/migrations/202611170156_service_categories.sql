create table public.barberflow_service_categories (
  establishment_id uuid not null references public.barberflow_establishments(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  name_key text generated always as (lower(name)) stored,
  primary key (establishment_id, name_key)
);

insert into public.barberflow_service_categories(establishment_id, name)
select establishment_id, min(btrim(category))
from public.barberflow_services
where char_length(btrim(category)) between 1 and 80
group by establishment_id, lower(btrim(category));

alter table public.barberflow_service_categories enable row level security;
grant select, insert(establishment_id, name) on public.barberflow_service_categories to authenticated;
create policy service_categories_read on public.barberflow_service_categories for select to authenticated
using (public.barberflow_team_can_edit_services(establishment_id) or exists (
  select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())
));
create policy service_categories_create on public.barberflow_service_categories for insert to authenticated
with check (public.barberflow_team_can_edit_services(establishment_id) or exists (
  select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())
));
create or replace function public.barberflow_restore_store(target_shop uuid, secret text, confirmation text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  shop_name text;
  saved_hash text;
  attempt_count integer;
begin
  select name into shop_name from public.barberflow_establishments
    where id = target_shop and owner_id = auth.uid() for update;
  if not found or translate(btrim(confirmation),chr(8216)||chr(8217)||chr(180),repeat(chr(39),3))
      is distinct from translate(btrim(shop_name),chr(8216)||chr(8217)||chr(180),repeat(chr(39),3)) or secret is null
    or octet_length(secret) > 72 then return false; end if;

  select password_hash into saved_hash from barberflow_private.store_reset_credentials
    where shop_id = target_shop for update;
  if not found then return false; end if;

  insert into barberflow_private.store_reset_setup_attempts as limits
    (shop_id, attempts, window_started_at)
    values (target_shop, 1, statement_timestamp())
    on conflict (shop_id) do update set
      attempts = case when limits.window_started_at <= statement_timestamp() - interval '15 minutes'
        then 1 else least(limits.attempts + 1, 6) end,
      window_started_at = case when limits.window_started_at <= statement_timestamp() - interval '15 minutes'
        then statement_timestamp() else limits.window_started_at end
    returning attempts into attempt_count;
  if attempt_count > 5 or extensions.crypt(secret,saved_hash) is distinct from saved_hash
    then return false; end if;

  delete from public.barberflow_review_reports where review_id in
    (select public_id from public.barberflow_reviews where establishment_id = target_shop);
  delete from public.barberflow_review_decisions where review_id in
    (select public_id from public.barberflow_reviews where establishment_id = target_shop);
  delete from public.barberflow_reviews where establishment_id = target_shop;
  delete from public.barberflow_loyalty_used_visits where redemption_id in
    (select id from public.barberflow_loyalty_redemptions where establishment_id = target_shop);
  delete from public.barberflow_loyalty_redemptions where establishment_id = target_shop;
  delete from public.barberflow_loyalty_rules where establishment_id = target_shop;
  delete from barberflow_private.commission_receipt_orders where shop = target_shop;
  delete from barberflow_private.commission_receipts where shop = target_shop;
  delete from barberflow_private.counter_commission where sale_id in
    (select id from barberflow_private.counter_sales where shop = target_shop);
  delete from barberflow_private.counter_sales where shop = target_shop;
  delete from barberflow_private.cash_closings where shop = target_shop;
  delete from barberflow_private.counter_sale_numbers where shop = target_shop;
  delete from barberflow_private.card_charges where shop_id = target_shop;
  delete from barberflow_private.card_accounts where shop_id = target_shop;
  delete from barberflow_private.receipt_payments where appointment_id in
    (select appointment_id from public.barberflow_receipts where establishment_id = target_shop);
  delete from public.barberflow_order_services where establishment_id = target_shop;
  delete from public.barberflow_order_products where establishment_id = target_shop;
  delete from public.barberflow_stock_movements where establishment_id = target_shop;
  delete from public.barberflow_receipts where establishment_id = target_shop;
  delete from public.barberflow_schedule where establishment_id = target_shop;
  delete from public.barberflow_clients where establishment_id = target_shop;
  delete from barberflow_private.client_numbers where shop = target_shop;
  delete from public.barberflow_showcase_orders where establishment_id = target_shop;
  delete from public.barberflow_showcase_pix where establishment_id = target_shop;
  delete from public.barberflow_stock_margins where shop = target_shop;
  delete from public.barberflow_products where establishment_id = target_shop;
  delete from barberflow_private.finance_settlements where entry_id in
    (select id from barberflow_private.finance_entries where establishment_id = target_shop);
  delete from barberflow_private.finance_entries where establishment_id = target_shop;
  delete from barberflow_private.finance_email_recovery where establishment_id = target_shop;
  delete from barberflow_private.finance_access where establishment_id = target_shop;
  delete from barberflow_private.team_access where establishment_id = target_shop;
  delete from public.barberflow_professional_services where establishment_id = target_shop;
  delete from public.barberflow_professional_hours where establishment_id = target_shop;
  delete from public.barberflow_professionals where establishment_id = target_shop;
  delete from public.barberflow_services where establishment_id = target_shop;
  delete from public.barberflow_service_categories where establishment_id = target_shop;
  delete from public.barberflow_social_photos where shop = target_shop;
  delete from public.barberflow_social_follow_shops where shop = target_shop;
  delete from public.barberflow_social_favorite_shops where shop = target_shop;

  update public.barberflow_establishments set
    published = default, slug = default, city = default, public_description = default,
    profile_details = default, auto_confirm = default, allow_customer_cancel = default,
    allow_customer_reschedule = default, min_notice_minutes = default, max_advance_days = default,
    change_notice_hours = default, slot_step_minutes = default, preparation_minutes = default,
    checkout_timezone = default
  where id = target_shop;

  delete from barberflow_private.store_reset_credentials where shop_id = target_shop;
  delete from barberflow_private.store_reset_setup_attempts where shop_id = target_shop;
  return true;
end;
$$;
revoke all on function public.barberflow_restore_store(uuid,text,text) from public, anon;
grant execute on function public.barberflow_restore_store(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';

create table barberflow_private.store_reset_credentials (
  shop_id uuid primary key references public.barberflow_establishments(id) on delete cascade,
  password_hash text not null,
  configured_at timestamptz not null default now()
);

alter table barberflow_private.store_reset_credentials enable row level security;
revoke all on barberflow_private.store_reset_credentials from public, anon, authenticated;

create table barberflow_private.store_reset_setup_attempts (
  shop_id uuid primary key references public.barberflow_establishments(id) on delete cascade,
  attempts integer not null,
  window_started_at timestamptz not null
);

alter table barberflow_private.store_reset_setup_attempts enable row level security;
revoke all on barberflow_private.store_reset_setup_attempts from public, anon, authenticated;

create function public.barberflow_configure_store_reset(
  target_shop uuid, account_password text, reset_password text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  owner_password_hash text;
  attempt_count integer;
begin
  if reset_password is null or char_length(reset_password) < 12
    or octet_length(reset_password) > 72 or account_password is null
    or octet_length(account_password) > 1024 then
    return false;
  end if;

  select u.encrypted_password into owner_password_hash
  from public.barberflow_establishments e
  join auth.users u on u.id = e.owner_id
  where e.id = target_shop and e.owner_id = auth.uid() for update of e;

  if not found then
    return false;
  end if;

  insert into barberflow_private.store_reset_setup_attempts as limits
    (shop_id, attempts, window_started_at)
  values (target_shop, 1, statement_timestamp())
  on conflict (shop_id) do update
    set attempts = case when limits.window_started_at <= statement_timestamp() - interval '15 minutes'
                        then 1 else least(limits.attempts + 1, 6) end,
        window_started_at = case when limits.window_started_at <= statement_timestamp() - interval '15 minutes'
                                 then statement_timestamp() else limits.window_started_at end
  returning attempts into attempt_count;

  if attempt_count > 5 then
    return false;
  end if;

  if nullif(owner_password_hash, '') is null
    or extensions.crypt(account_password, owner_password_hash) is distinct from owner_password_hash
    or extensions.crypt(reset_password, owner_password_hash) = owner_password_hash then
    return false;
  end if;

  insert into barberflow_private.store_reset_credentials (shop_id, password_hash)
  values (target_shop, extensions.crypt(reset_password, extensions.gen_salt('bf', 10)))
  on conflict (shop_id) do update
    set password_hash = excluded.password_hash, configured_at = now();
  delete from barberflow_private.store_reset_setup_attempts where shop_id = target_shop;
  return true;
end;
$$;

revoke all on function public.barberflow_configure_store_reset(uuid, text, text) from public, anon;
grant execute on function public.barberflow_configure_store_reset(uuid, text, text) to authenticated;

create function public.barberflow_restore_store(target_shop uuid, secret text, confirmation text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  shop_name text;
  saved_hash text;
  attempt_count integer;
begin
  select name into shop_name from public.barberflow_establishments
    where id = target_shop and owner_id = auth.uid() for update;
  if not found or confirmation is distinct from shop_name or secret is null
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

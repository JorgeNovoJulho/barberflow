-- Run on a disposable Supabase database with migrations applied.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,encrypted_password)
values('10000000-0000-4000-8000-000000000011','finance-owner@example.test',now(),'{"provider":"email"}','{"account_intent":"barbearia"}',extensions.crypt('SenhaLogin789',extensions.gen_salt('bf',4)));
insert into public.barberflow_establishments(id,owner_id,name,segment,slug,city)
values('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011','Loja de teste','barbearia','teste-financeiro','Rio');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
do $$
declare shop uuid:='20000000-0000-4000-8000-000000000011';
begin
  perform set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000011","session_id":"90000000-0000-4000-8000-000000000001"}',true);
  assert public.barberflow_finance_unlock(shop,'SenhaAntiga123',true)='unlocked';
  perform public.barberflow_finance_lock(shop);
  assert public.barberflow_finance_unlock(shop,'errada',false)='incorrect_2';
  assert public.barberflow_finance_unlock(shop,'SenhaErrada456',false)='incorrect_1';
  assert public.barberflow_finance_unlock(shop,'SenhaErrada456',false)='incorrect_blocked';
  assert public.barberflow_finance_status(shop)='blocked';
  assert public.barberflow_finance_unlock(shop,'SenhaAntiga123',false)='blocked';
  assert public.barberflow_request_finance_email(shop)='requested';
  assert public.barberflow_reset_finance_email(shop,'SenhaNova456')='expired';

  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','10000000-0000-4000-8000-000000000011','session_id','90000000-0000-4000-8000-000000000002',
    'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from now()))+1)))::text,true);
  assert public.barberflow_reset_finance_email(shop,'SenhaLogin789')='reused';
  assert public.barberflow_finance_status(shop)='blocked';
  assert public.barberflow_reset_finance_email(shop,'SenhaNova456')='reset';
  assert public.barberflow_finance_status(shop)='unlocked';
  assert public.barberflow_reset_finance_email(shop,'OutraSenha456')='expired';
  perform public.barberflow_finance_lock(shop);
  assert public.barberflow_finance_unlock(shop,'SenhaAntiga123',false)='incorrect_2';
  assert public.barberflow_finance_unlock(shop,'SenhaNova456',false)='unlocked';
end $$;
reset role;
rollback;

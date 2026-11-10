-- Run against a disposable Supabase database with migrations applied.
begin;
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','owner@example.test',now(),'{"provider":"email"}','{"account_intent":"barbearia"}'),
 ('10000000-0000-4000-8000-000000000002','client@example.test',now(),'{"provider":"email"}','{"account_intent":"cliente"}'),
 ('10000000-0000-4000-8000-000000000003','other@example.test',now(),'{"provider":"google"}','{}');
insert into public.barberflow_establishments(id,owner_id,name,segment,slug,city,published) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Loja de teste','barbearia','teste','Rio',true);
insert into public.barberflow_services(id,establishment_id,name,price_cents,duration_minutes) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Corte',5000,30);
insert into public.barberflow_products(id,establishment_id,name,price_cents,stock) values
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Pomada',2000,5);
insert into public.barberflow_showcase_pix values('20000000-0000-4000-8000-000000000001','owner@example.test','LOJA','RIO');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
declare shop uuid:='20000000-0000-4000-8000-000000000001';
begin
  assert public.barberflow_account_kind()='cliente';
  assert public.barberflow_initialize_google_account('barbearia')='cliente';
  begin
    insert into public.barberflow_establishments(name,segment) values('Oferta indevida','barbearia');
    raise exception 'Cliente conseguiu criar loja';
  exception when insufficient_privilege then null;
  end;
  insert into public.barberflow_social_favorite_shops(shop) values(shop);
  assert (select count(*) from public.barberflow_saved_shops('favorites',0))=1;
  assert (select count(*) from public.barberflow_saved_shops('following',0))=0;
  insert into public.barberflow_social_follow_shops(shop) values(shop);
  delete from public.barberflow_social_favorite_shops f where f.shop='20000000-0000-4000-8000-000000000001';
  assert (select count(*) from public.barberflow_saved_shops('favorites',0))=0;
  assert (select count(*) from public.barberflow_saved_shops('following',0))=1;
  insert into public.barberflow_social_profiles(username) values('cliente_teste');
  assert (public.barberflow_username_availability('CLIENTE_TESTE')->>'available')::boolean;
  update public.barberflow_social_profiles set theme='rosa' where user_id=auth.uid() and revision=0;
  assert found;
  update public.barberflow_social_profiles set theme='azul' where user_id=auth.uid() and revision=0;
  assert not found;
  assert (select theme='rosa' from public.barberflow_social_profiles where user_id=auth.uid());
  perform public.barberflow_touch_activity();
  insert into public.barberflow_social_photos(object_path,caption,audience)
    values(auth.uid()::text||'/50000000-0000-4000-8000-000000000001','Privada','followers');
  begin
    insert into public.barberflow_social_photos(shop,object_path,caption)
      values(shop,auth.uid()::text||'/50000000-0000-4000-8000-000000000002','Anuncio proibido');
    raise exception 'Cliente publicou como loja';
  exception when insufficient_privilege then null;
  end;
  assert not public.barberflow_social_review(shop,0::smallint,'Sem compra ou atendimento');
  assert public.barberflow_counter_open(shop,0) is null;
  assert public.barberflow_save_counter_sale(shop,gen_random_uuid(),0,'','','[]','save',null,null)='denied';
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$
declare photo_id uuid;
begin
  assert public.barberflow_account_kind() is null;
  assert public.barberflow_initialize_google_account('cliente')='cliente';
  assert public.barberflow_initialize_google_account('barbearia')='cliente';
  assert not (public.barberflow_username_availability(' CLIENTE_TESTE ')->>'available')::boolean;
  assert jsonb_array_length(public.barberflow_username_availability('CLIENTE_TESTE')->'suggestions')=3;
  begin
    insert into public.barberflow_social_profiles(username) values('CLIENTE_TESTE');
    raise exception 'Nome duplicado aceito';
  exception when unique_violation then null;
  end;
  insert into public.barberflow_social_profiles(username) values('outro_teste');
  assert (public.barberflow_profile_presence('10000000-0000-4000-8000-000000000002',null)->>'online')::boolean;
  assert not exists(select 1 from public.barberflow_social_photos);
  insert into public.barberflow_social_follow_users(target) values('10000000-0000-4000-8000-000000000002');
  select id into strict photo_id from public.barberflow_social_feed(0);
  insert into public.barberflow_social_likes(photo) values(photo_id);
  insert into public.barberflow_social_comments(photo,body) values(photo_id,'Oi');
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  assert (select count(*) from public.barberflow_social_notices(0))=2;
  assert public.barberflow_social_connections(auth.uid(),'followers',0)->>'count'='1';
  insert into public.barberflow_social_follow_users(target) values('10000000-0000-4000-8000-000000000003');
  assert public.barberflow_block_profile('10000000-0000-4000-8000-000000000003',true);
  assert public.barberflow_social_connections(auth.uid(),'followers',0)->>'count'='0';
  assert public.barberflow_social_connections(auth.uid(),'following',0)->>'count'='0';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$
declare target_id uuid:='10000000-0000-4000-8000-000000000002';
begin
  assert not exists(select 1 from public.barberflow_social_feed(0));
  assert public.barberflow_profile_presence(target_id,null) is null;
  begin
    insert into public.barberflow_social_follow_users(target) values(target_id);
    raise exception 'Seguir após bloqueio';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update barberflow_private.account_activity set seen_at=now()-interval '3 minutes'
where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$
begin
  assert public.barberflow_block_profile('10000000-0000-4000-8000-000000000003',false);
  assert not (public.barberflow_profile_presence(auth.uid(),null)->>'online')::boolean;
  assert public.barberflow_profile_presence(auth.uid(),null)->>'lastSeen' is not null;
end $$;

do $$
declare owner uuid:='10000000-0000-4000-8000-000000000001';
begin
  insert into public.barberflow_social_photos(object_path,caption,audience) values('','Texto público','public');
  insert into public.barberflow_social_photos(object_path,caption,audience) values('','Texto privado','private');
  insert into public.barberflow_social_photos(object_path,extra_photos,caption)
  values(auth.uid()::text||'/50000000-0000-4000-8000-000000000003',
    array[auth.uid()::text||'/50000000-0000-4000-8000-000000000004'],'Duas fotos');
  assert public.barberflow_profile_summary(auth.uid())->>'joined' is not null;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  assert exists(select 1 from public.barberflow_social_feed(0) where caption='Texto público');
  assert exists(select 1 from public.barberflow_social_feed(0) where caption='Duas fotos' and cardinality(extra_photos)=1);
  assert not exists(select 1 from public.barberflow_social_feed(0) where caption='Texto privado');
end $$;
reset role;
delete from public.barberflow_showcase_pix where establishment_id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare
  shop uuid:='20000000-0000-4000-8000-000000000001';
  sale uuid:='40000000-0000-4000-8000-000000000001';
  selections jsonb:='[{"kind":"service","id":"30000000-0000-4000-8000-000000000001","units":1},{"kind":"product","id":"30000000-0000-4000-8000-000000000002","units":2}]';
begin
  assert public.barberflow_save_counter_sale(shop,sale,0,'Cliente','',selections,'charge','pix',null)='pix_missing';
  assert public.barberflow_counter_sale(shop,sale) is null;
  assert public.barberflow_save_counter_sale(shop,sale,0,'Cliente','',selections,'save',null,null)='ok';
  assert public.barberflow_counter_sale(shop,sale)->>'state'='open';
  assert (select stock from public.barberflow_products where id='30000000-0000-4000-8000-000000000002')=5;
end $$;
reset role;
insert into public.barberflow_showcase_pix values('20000000-0000-4000-8000-000000000001','owner@example.test','LOJA','RIO');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare
  shop uuid:='20000000-0000-4000-8000-000000000001';
  sale uuid:='40000000-0000-4000-8000-000000000001';
  second uuid:='40000000-0000-4000-8000-000000000002';
  third uuid:='40000000-0000-4000-8000-000000000003';
  selections jsonb:='[{"kind":"service","id":"30000000-0000-4000-8000-000000000001","units":1},{"kind":"product","id":"30000000-0000-4000-8000-000000000002","units":2}]';
  summary jsonb;
begin
  assert public.barberflow_counter_sale(shop,sale)->>'number' like '000.001.%';
  update public.barberflow_products set price_cents=9000 where id='30000000-0000-4000-8000-000000000002';
  assert public.barberflow_save_counter_sale(shop,sale,2,'Cliente','',selections,'charge','pix',null)='ok';
  assert public.barberflow_counter_sale(shop,sale)->>'product_cents'='4000';
  assert public.barberflow_counter_sale(shop,sale)->>'state'='pending';
  assert public.barberflow_counter_sale(shop,sale)->'pix'->>'pix_key'='owner@example.test';
  assert public.barberflow_counter_report(shop,'dia','ambos',0)->>'pix'='0';
  assert public.barberflow_counter_archive(shop,0)='[]'::jsonb;
  assert public.barberflow_save_counter_sale(shop,sale,3,'','',null,'confirm',null,'PIX-123456',8999)='amount';
  assert public.barberflow_save_counter_sale(shop,sale,3,'','',null,'confirm',null,'PIX-123456',9000)='ok';
  assert public.barberflow_save_counter_sale(shop,sale,3,'','',null,'confirm',null,'PIX-123456',9000)='ok';
  assert public.barberflow_counter_archive(shop,0)->0->>'id'=sale::text;
  assert not ((public.barberflow_counter_archive(shop,0)->0) ? 'pix');
  summary:=public.barberflow_counter_report(shop,'dia','ambos',0);
  assert summary->>'pix'='9000' and summary->>'units'='2';
  assert public.barberflow_counter_report(shop,'dia','servicos',0)->>'pix'='5000';
  assert public.barberflow_counter_report(shop,'quinzena','produtos',0)->>'pix'='4000';
  assert public.barberflow_save_counter_sale(shop,second,0,'','',selections,'charge','debit',null)='ok';
  assert public.barberflow_counter_sale(shop,second)->>'number' like '000.002.%';
  assert public.barberflow_save_counter_sale(shop,third,0,'','',selections,'charge','credit',null)='stock';
  assert public.barberflow_counter_sale(shop,third) is null;
  assert public.barberflow_save_counter_sale(shop,second,2,'','',null,'cancel',null,null)='ok';
  assert public.barberflow_save_counter_sale(shop,third,0,'','',selections,'charge','credit',null)='ok';
  assert public.barberflow_counter_sale(shop,third)->>'number' like '000.003.%';
  assert public.barberflow_save_counter_sale(shop,third,2,'','',null,'confirm',null,'CARD-123456',23000)='ok';
  assert public.barberflow_counter_report(shop,'dia','ambos',0)->>'credit'='23000';
end $$;
reset role;
do $$ begin
  assert (select count(*) from barberflow_private.finance_settlements)=2;
end $$;
rollback;

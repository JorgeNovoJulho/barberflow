-- Transactional regression checks. Requires the platform master account fixture.
begin;
do $$
declare
  owner uuid;
  shop uuid := gen_random_uuid();
  person uuid;
  service uuid;
  payment uuid;
  charge uuid;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select user_id into strict owner from barberflow_private.master_account limit 1;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  insert into public.barberflow_establishments(id,owner_id,name,segment,slug,published)
    values(shop,owner,'Validação transacional de planos','barbearia','validacao-'||shop::text,false);
  if (select trial_until from public.barberflow_subscriptions where establishment_id=shop) <> today+7 then
    raise exception 'Teste gratuito nao tem 7 dias';
  end if;
  insert into public.barberflow_professionals(establishment_id,name) values(shop,'Profissional 1') returning id into person;
  insert into public.barberflow_professionals(establishment_id,name) values(shop,'Profissional 2');
  begin
    insert into public.barberflow_professionals(establishment_id,name) values(shop,'Profissional excedente');
    raise exception 'Pro aceitou mais de 2 profissionais';
  exception when sqlstate 'BF001' then null; end;

  for i in 1..3 loop
    insert into public.barberflow_services(establishment_id,name,price_cents,duration_minutes) values(shop,'Serviço '||i,1000,30) returning id into service;
    begin
      insert into public.barberflow_professional_services(establishment_id,professional_id,service_id) values(shop,person,service);
      if i=3 then raise exception 'Pro aceitou terceiro servico'; end if;
    exception when sqlstate 'BF001' then
      if i<>3 then raise; end if;
    end;
  end loop;

  for i in 1..16 loop
    begin
      insert into public.barberflow_products(establishment_id,name,price_cents,stock,showcase) values(shop,'Produto '||i,1000,1,true);
      if i=16 then raise exception 'Pro aceitou 16 produtos'; end if;
    exception when sqlstate 'BF001' then if i<>16 then raise; end if; end;
  end loop;

  if not public.barberflow_confirm_subscription_payment(shop,'monthly',15990,'validacao-premium','premium') then raise exception 'Aprovacao premium falhou'; end if;
  if barberflow_private.subscription_tier(shop)<>'premium' then raise exception 'Upgrade nao imediato'; end if;
  if (select starts_on from public.barberflow_subscription_payments where establishment_id=shop and reference='validacao-premium')<>today then raise exception 'Upgrade nao comeca hoje'; end if;
  if public.barberflow_confirm_subscription_payment(shop,'monthly',15990,'validacao-premium','premium') then raise exception 'Pagamento duplicado aceito'; end if;
  for i in 3..5 loop
    insert into public.barberflow_professionals(establishment_id,name) values(shop,'Profissional '||i);
  end loop;
  begin
    insert into public.barberflow_professionals(establishment_id,name) values(shop,'Premium excedente');
    raise exception 'Premium aceitou sexto profissional';
  exception when sqlstate 'BF001' then null; end;
  for i in 16..40 loop
    insert into public.barberflow_products(establishment_id,name,price_cents,stock,showcase) values(shop,'Produto '||i,1000,1,true);
  end loop;
  begin
    insert into public.barberflow_products(establishment_id,name,price_cents,stock,showcase) values(shop,'Premium excedente',1000,1,true);
    raise exception 'Premium aceitou produto 41';
  exception when sqlstate 'BF001' then null; end;

  charge := public.barberflow_issue_subscription_pix(shop,'monthly','unlimited');
  if charge is null or not exists(select 1 from public.barberflow_subscription_charges where id=charge and plan='unlimited' and amount_cents=25990) then
    raise exception 'Cobranca Unlimited com valor incorreto';
  end if;
  if barberflow_private.subscription_tier(shop)<>'premium' then raise exception 'Cobranca liberou plano antes da aprovacao'; end if;
  update public.barberflow_subscription_charges set status='submitted' where id=charge;
  if not public.barberflow_review_subscription_pix(charge,25990,'validacao-unlimited',null) then raise exception 'Aprovacao manual falhou'; end if;
  if public.barberflow_review_subscription_pix(charge,25990,'validacao-unlimited',null) then raise exception 'Aprovacao duplicada aceita'; end if;
  select payment_id into payment from public.barberflow_subscription_charges where id=charge;
  update public.barberflow_subscription_payments set confirmed_at=clock_timestamp()+interval '1 second' where id=payment;
  if barberflow_private.subscription_tier(shop)<>'unlimited' then raise exception 'Unlimited indisponivel'; end if;
  insert into public.barberflow_professionals(establishment_id,name) values(shop,'Unlimited adicional');
  for i in 41..200 loop
    insert into public.barberflow_products(establishment_id,name,price_cents,stock,showcase) values(shop,'Produto '||i,1000,1,true);
  end loop;
  begin
    insert into public.barberflow_products(establishment_id,name,price_cents,stock,showcase) values(shop,'Unlimited excedente',1000,1,true);
    raise exception 'Unlimited aceitou produto 201';
  exception when sqlstate 'BF001' then null; end;
  -- Existing rows remain editable after a downgrade.
  update public.barberflow_subscription_payments set plan='pro',confirmed_at=clock_timestamp()+interval '2 seconds' where id=payment;
  update public.barberflow_professionals set name='Atualizado após downgrade' where id=person;
  if (select count(*) from public.barberflow_products where establishment_id=shop)<>200 then raise exception 'Dados removidos no downgrade'; end if;
  begin
    insert into public.barberflow_professionals(establishment_id,name) values(shop,'Downgrade excedente');
    raise exception 'Downgrade aceitou novo excedente';
  exception when sqlstate 'BF001' then null; end;
  if public.barberflow_plan_limit_status(shop)->>'owner' <> 'true' then raise exception 'Consulta autorizada falhou'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if public.barberflow_plan_limit_status(shop) is not null then raise exception 'Plano exposto a outra loja'; end if;
end $$;


do $$
declare
  shop uuid := gen_random_uuid();
  owner uuid;
  person uuid;
  service uuid;
  payment uuid;
  start_date date := (now() at time zone 'America/Sao_Paulo')::date+10;
begin
  select user_id into strict owner from barberflow_private.master_account limit 1;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  insert into public.barberflow_establishments(id,owner_id,name,segment) values(shop,owner,'Validacao de limites diarios','barbearia');
  insert into public.barberflow_professionals(establishment_id,name) values(shop,'Profissional') returning id into person;
  insert into public.barberflow_services(establishment_id,name,price_cents,duration_minutes) values(shop,'Servico',1000,5) returning id into service;
  insert into public.barberflow_professional_services(establishment_id,professional_id,service_id) values(shop,person,service);
  for i in 0..8 loop
    begin
      insert into public.barberflow_schedule(establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name)
      values(shop,person,service,'appointment',start_date+time '08:00'+i*interval '10 minutes',start_date+time '08:05'+i*interval '10 minutes','Servico',1000,'Teste');
      if i=8 then raise exception 'Pro aceitou 9 agendamentos'; end if;
    exception when sqlstate 'BF001' then if i<>8 then raise; end if; end;
  end loop;
  insert into public.barberflow_subscription_payments(establishment_id,period,amount_cents,reference,starts_on,ends_before,plan)
    values(shop,'monthly',15990,'teste-premium',(now() at time zone 'America/Sao_Paulo')::date,start_date+30,'premium') returning id into payment;
  for i in 0..20 loop
    begin
      insert into public.barberflow_schedule(establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name)
      values(shop,person,service,'appointment',start_date+1+time '08:00'+i*interval '10 minutes',start_date+1+time '08:05'+i*interval '10 minutes','Servico',1000,'Teste');
      if i=20 then raise exception 'Premium aceitou 21 agendamentos'; end if;
    exception when sqlstate 'BF001' then if i<>20 then raise; end if; end;
  end loop;
  for i in 2..6 loop
    insert into public.barberflow_services(establishment_id,name,price_cents,duration_minutes) values(shop,'Servico '||i,1000,5) returning id into service;
    begin
      insert into public.barberflow_professional_services(establishment_id,professional_id,service_id) values(shop,person,service);
      if i=6 then raise exception 'Premium aceitou sexto vinculo'; end if;
    exception when sqlstate 'BF001' then if i<>6 then raise; end if; end;
  end loop;
  update public.barberflow_subscription_payments set plan='unlimited' where id=payment;
  for i in 0..30 loop
    insert into public.barberflow_schedule(establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name)
    values(shop,person,service,'appointment',start_date+2+time '08:00'+i*interval '10 minutes',start_date+2+time '08:05'+i*interval '10 minutes','Servico',1000,'Teste');
  end loop;
end $$;

rollback;

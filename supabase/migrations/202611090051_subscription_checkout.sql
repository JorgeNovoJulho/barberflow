alter table public.barberflow_plan_settings
  add column pix_city text not null default '' check(char_length(pix_city)<=15),
  add column pix_merchant text not null default '' check(char_length(pix_merchant)<=25),
  add column grace_days integer not null default 3 check(grace_days between 0 and 30),
  add column billing_rules text not null default 'Durante o teste, a vigência paga começa ao fim do teste.
Na renovação, a nova vigência começa após o último período confirmado.
Durante a regularização, consulte a situação da assinatura no painel.' check(char_length(billing_rules)<=2500),
  add column plan_benefits text not null default 'Agenda por profissional
Página pública e presença no catálogo BARBERFLOW
Gestão de clientes e programa de fidelidade
Estoque, comandas e relatórios financeiros' check(char_length(plan_benefits)<=2500);

grant update(pix_city,pix_merchant,grace_days,billing_rules,plan_benefits)
  on public.barberflow_plan_settings to authenticated;

create or replace function barberflow_private.subscription_bookable(shop uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(greatest(
    (select s.trial_until from public.barberflow_subscriptions s where s.establishment_id=shop),
    (select max(p.ends_before) from public.barberflow_subscription_payments p
      where p.establishment_id=shop and p.starts_on<=(now() at time zone 'America/Sao_Paulo')::date)
  )+(select grace_days from public.barberflow_plan_settings)>(now() at time zone 'America/Sao_Paulo')::date,false);
$$;

create table public.barberflow_subscription_charges (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  period text not null check(period in ('monthly','yearly')),
  amount_cents integer not null check(amount_cents between 1 and 99999999),
  pix_key text not null check(pix_key ~ '^[!-~]{1,77}$'),
  merchant text not null check(merchant ~ '^[A-Z0-9 .-]{1,25}$'),
  city text not null check(city ~ '^[A-Z0-9 .-]{1,15}$'),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  receipt_path text unique,
  status text not null default 'pending' check(status in ('pending','submitted','confirmed','rejected')),
  payment_id uuid unique references public.barberflow_subscription_payments(id),
  bank_reference text unique,
  rejection_reason text
);

create unique index barberflow_subscription_open_charge
  on public.barberflow_subscription_charges(establishment_id,period) where status in ('pending','submitted');
create index barberflow_subscription_review_queue
  on public.barberflow_subscription_charges(submitted_at) where status='submitted';
create index barberflow_subscription_charges_history
  on public.barberflow_subscription_charges(establishment_id,created_at desc);

alter table public.barberflow_subscription_charges enable row level security;
revoke all on public.barberflow_subscription_charges from public,anon,authenticated;
grant select on public.barberflow_subscription_charges to authenticated;
create policy "Read subscription charges" on public.barberflow_subscription_charges for select to authenticated
  using((select public.barberflow_is_master()) or exists(
    select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())
  ));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('barberflow-subscription-proofs','barberflow-subscription-proofs',false,5242880,
  array['application/pdf','image/jpeg','image/png','image/webp']);

create function public.barberflow_subscription_proof_access(object_path text, operation text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.barberflow_subscription_charges c
    join public.barberflow_establishments e on e.id=c.establishment_id
    where c.establishment_id::text=split_part(object_path,'/',1)
      and c.id::text=split_part(object_path,'/',2)
      and split_part(object_path,'/',3) ~ '^[a-f0-9-]{36}[.](pdf|jpg|png|webp)$'
      and split_part(object_path,'/',4)='' and object_path not like '%/'
      and (
        (operation='read' and c.receipt_path=object_path
          and (e.owner_id=(select auth.uid()) or (select public.barberflow_is_master())))
        or (e.owner_id=(select auth.uid()) and (
          (operation in ('upload','read') and c.status='pending')
          or (operation='read' and c.receipt_path is distinct from object_path)
        ))
      )
  );
$$;

create policy "Upload own subscription proof" on storage.objects for insert to authenticated
  with check(bucket_id='barberflow-subscription-proofs' and public.barberflow_subscription_proof_access(name,'upload'));
create policy "Read authorized subscription proof" on storage.objects for select to authenticated
  using(bucket_id='barberflow-subscription-proofs' and public.barberflow_subscription_proof_access(name,'read'));

create function public.barberflow_issue_subscription_pix(shop uuid, selected_period text)
returns uuid language plpgsql security definer set search_path='' as $$
declare charge uuid;
begin
  if selected_period is null or selected_period not in ('monthly','yearly') then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  select c.id into charge from public.barberflow_subscription_charges c
    where c.establishment_id=shop and c.period=selected_period and c.status in ('pending','submitted');
  if found then return charge; end if;
  insert into public.barberflow_subscription_charges(establishment_id,period,amount_cents,pix_key,merchant,city)
    select shop,selected_period,case when selected_period='monthly' then monthly_cents else yearly_cents end,
      pix_key,pix_merchant,pix_city
    from public.barberflow_plan_settings
    where pix_key ~ '^[!-~]{1,77}$' and pix_merchant ~ '^[A-Z0-9 .-]{1,25}$' and pix_city ~ '^[A-Z0-9 .-]{1,15}$'
    returning id into charge;
  return charge;
end;
$$;

create function public.barberflow_submit_subscription_proof(shop uuid, charge uuid, object_path text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not public.barberflow_subscription_proof_access(object_path,'upload') then return false; end if;
  perform 1 from storage.objects o where o.bucket_id='barberflow-subscription-proofs' and o.name=object_path for update;
  if not found then return false; end if;
  update public.barberflow_subscription_charges c set status='submitted',receipt_path=object_path,submitted_at=now()
    where c.id=charge and c.establishment_id=shop and c.status='pending'
      and split_part(object_path,'/',1)=shop::text and split_part(object_path,'/',2)=charge::text
      and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
  return found;
end;
$$;

create function public.barberflow_review_subscription_pix(charge uuid, received_cents integer, reference text, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare request public.barberflow_subscription_charges%rowtype;
begin
  if not public.barberflow_is_master() then return false; end if;
  select * into request from public.barberflow_subscription_charges c where c.id=charge for update;
  if not found or request.status<>'submitted' then return false; end if;
  if reason is not null then
    if char_length(btrim(reason)) not between 1 and 500 then return false; end if;
    update public.barberflow_subscription_charges set status='rejected',rejection_reason=btrim(reason) where id=charge;
    return true;
  end if;
  if received_cents is distinct from request.amount_cents or reference is null
    or char_length(btrim(reference)) not between 1 and 160 then return false; end if;
  if not public.barberflow_confirm_subscription_payment(request.establishment_id,request.period,received_cents,btrim(reference))
    then return false; end if;
  update public.barberflow_subscription_charges set status='confirmed',bank_reference=btrim(reference),payment_id=(
    select p.id from public.barberflow_subscription_payments p
      where p.establishment_id=request.establishment_id and p.reference=btrim(barberflow_review_subscription_pix.reference)
  ) where id=charge;
  return true;
end;
$$;

revoke all on function public.barberflow_subscription_proof_access(text,text),
  public.barberflow_issue_subscription_pix(uuid,text),public.barberflow_submit_subscription_proof(uuid,uuid,text),
  public.barberflow_review_subscription_pix(uuid,integer,text,text) from public,anon;
grant execute on function public.barberflow_subscription_proof_access(text,text),
  public.barberflow_issue_subscription_pix(uuid,text),public.barberflow_submit_subscription_proof(uuid,uuid,text),
  public.barberflow_review_subscription_pix(uuid,integer,text,text) to authenticated;

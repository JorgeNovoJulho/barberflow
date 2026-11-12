begin;
update storage.buckets
set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/bmp']
where id='barberflow-subscription-proofs';

create or replace function public.barberflow_subscription_proof_access(object_path text, operation text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.barberflow_subscription_charges c
    join public.barberflow_establishments e on e.id=c.establishment_id
    where c.establishment_id::text=split_part(object_path,'/',1)
      and c.id::text=split_part(object_path,'/',2)
      and split_part(object_path,'/',3) ~ '^[a-f0-9-]{36}[.](pdf|jpg|png|webp|bmp)$'
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

create function public.barberflow_subscription_review_details(charge_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(c.id,jsonb_build_object(
    'name',e.name,'logo',e.profile_details->>'logo',
    'ends_before',(s.starts_on+case c.period when 'monthly' then interval '1 month' else interval '1 year' end)::date
  )), '{}'::jsonb)
  from public.barberflow_subscription_charges c
  join public.barberflow_establishments e on e.id=c.establishment_id
  cross join lateral (
    select greatest((now() at time zone 'America/Sao_Paulo')::date,
      (select trial_until from public.barberflow_subscriptions where establishment_id=e.id),
      (select max(ends_before) from public.barberflow_subscription_payments where establishment_id=e.id)) as starts_on
  ) s
  where public.barberflow_is_master() and c.status='submitted'
    and cardinality(charge_ids)<=100 and c.id=any(charge_ids);
$$;
revoke all on function public.barberflow_subscription_review_details(uuid[]) from public,anon;
grant execute on function public.barberflow_subscription_review_details(uuid[]) to authenticated;

create or replace function public.barberflow_master_finance(search_text text, page_index integer) returns jsonb
language sql stable security definer set search_path='' as $$
  with shops as (
    select e.id,e.name,e.city,e.profile_details->>'logo' as logo,
      barberflow_private.subscription_status(e.id)->>'plan' as plan,public.barberflow_shop_access_state(e.id) as status,c.bonus_until,s.trial_until,
      greatest(s.trial_until,c.bonus_until,p.paid_until) as valid_until,p.paid_until
    from public.barberflow_establishments e
    left join barberflow_private.subscription_controls c on c.shop_id=e.id
    left join public.barberflow_subscriptions s on s.establishment_id=e.id
    left join lateral (select max(ends_before) as paid_until from public.barberflow_subscription_payments where establishment_id=e.id) p on true
    where public.barberflow_is_master()
  ), filtered as (
    select * from shops where coalesce(search_text,'')='' or strpos(lower(name),lower(left(search_text,120)))>0 or id::text=search_text
  ), payments as (
    select p.id,p.plan,p.period,p.reference,p.amount_cents,p.confirmed_at,p.starts_on,p.ends_before,s.name,s.logo,
      exists(select 1 from public.barberflow_subscription_payments old
        where old.establishment_id=p.establishment_id and old.starts_on<p.starts_on) as renewal
    from public.barberflow_subscription_payments p join filtered s on s.id=p.establishment_id
    order by p.confirmed_at desc,p.id limit 25 offset greatest(0,least(page_index,100000))*25
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'payments_total',(select count(*) from public.barberflow_subscription_payments p join filtered s on s.id=p.establishment_id),
    'paid',(select coalesce(sum(amount_cents),0) from public.barberflow_subscription_payments p join filtered s on s.id=p.establishment_id),
    'restricted',(select count(*) from filtered where status<>'normal'),
    'valid',(select count(*) from filtered where status='normal' and valid_until>(now() at time zone 'America/Sao_Paulo')::date),
    'shops',coalesce((select jsonb_agg(to_jsonb(r) order by r.name,r.id) from (
      select * from filtered order by name,id limit 25 offset greatest(0,least(page_index,100000))*25
    ) r),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.confirmed_at desc,p.id) from payments p),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id desc) from (
      select h.id,h.operation,h.reason,h.created_at,h.bonus_until,s.name
      from barberflow_private.subscription_control_history h join filtered s on s.id=h.shop_id
      order by h.created_at desc,h.id desc limit 25
    ) h),'[]'::jsonb)
  ) where public.barberflow_is_master();
$$;

notify pgrst, 'reload schema';
commit;

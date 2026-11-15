create or replace function public.barberflow_client_visit_details(shop uuid, client uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with allowed as (
    select c.id from public.barberflow_clients c where c.establishment_id=shop and c.id=client
      and (public.barberflow_team_can_edit_clients(shop)
        or exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()))
  ), visits as (
    select a.* from public.barberflow_schedule a join allowed c on c.id=a.client_id
    where a.establishment_id=shop and a.kind='appointment' and a.state='completed'
  ), recent as (
    select * from visits order by starts_at desc,id limit 25
  ), service_uses as (
    select service_id as item,service_name as name from visits
    union all
    select s.service_id,s.service_name from public.barberflow_order_services s
    join visits v on v.id=s.appointment_id where s.establishment_id=shop
  ), top_services as (
    select max(name) as name,count(*) as quantity,
      row_number() over(order by count(*) desc,max(name),item) as position
    from service_uses group by item order by position limit 5
  ), top_products as (
    select max(p.product_name) as name,sum(p.quantity) as quantity,
      row_number() over(order by sum(p.quantity) desc,max(p.product_name),p.product_id) as position
    from public.barberflow_order_products p join visits v on v.id=p.appointment_id
    where p.establishment_id=shop and exists (
      select 1 from public.barberflow_receipts r where r.appointment_id=v.id and r.establishment_id=shop
        and r.total_cents<=coalesce((select sum(m.amount_cents) from barberflow_private.receipt_payments m
          where m.appointment_id=r.appointment_id and m.reversed_at is null),0)
    )
    group by p.product_id order by position limit 5
  ), monthly as (
    select extract(dow from starts_at)::integer as weekday,extract(hour from starts_at)::integer as hour,count(*) as visits
    from visits where starts_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo')
      and starts_at<date_trunc('month',now() at time zone 'America/Sao_Paulo')+interval '1 month'
    group by 1,2
  )
  select jsonb_build_object(
    'visits',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'starts',a.starts_at,'service',a.service_name,'professional',p.name,
      'additional_services',coalesce((select jsonb_agg(s.service_name order by s.service_name)
        from public.barberflow_order_services s where s.establishment_id=shop and s.appointment_id=a.id),'[]'),
      'products',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity) order by i.product_name)
        from public.barberflow_order_products i where i.establishment_id=shop and i.appointment_id=a.id),'[]'),
      'paid_cents',coalesce((select sum(m.amount_cents) from barberflow_private.receipt_payments m
        where m.appointment_id=r.appointment_id and m.reversed_at is null),0)
    ) order by a.starts_at desc,a.id)
    from recent a
    join public.barberflow_professionals p on p.establishment_id=shop and p.id=a.professional_id
    left join public.barberflow_receipts r on r.establishment_id=shop and r.appointment_id=a.id),'[]'),
    'top_services',coalesce((select jsonb_agg(to_jsonb(s) order by s.position desc) from top_services s),'[]'),
    'top_products',coalesce((select jsonb_agg(to_jsonb(p) order by p.position desc) from top_products p),'[]'),
    'frequency',coalesce((select jsonb_agg(to_jsonb(m) order by m.visits desc,m.weekday,m.hour) from monthly m),'[]')
  ) from allowed;
$$;
revoke all on function public.barberflow_client_visit_details(uuid,uuid) from public,anon;
grant execute on function public.barberflow_client_visit_details(uuid,uuid) to authenticated;

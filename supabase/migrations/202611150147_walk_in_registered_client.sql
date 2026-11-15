alter table barberflow_private.counter_sales add column client_id uuid;
alter table barberflow_private.counter_sales add constraint counter_sale_client
  foreign key (shop,client_id) references public.barberflow_clients(establishment_id,id)
  on delete set null (client_id);
create index counter_sales_client on barberflow_private.counter_sales(shop,client_id) where client_id is not null;

create function public.barberflow_create_registered_walk_in(shop_id uuid, sale_id uuid, selected_client uuid, selections jsonb)
returns text language plpgsql security definer set search_path='' as $$
declare
  person uuid := barberflow_private.individual_professional(shop_id);
  customer record;
  result text;
begin
  if person is null or not public.barberflow_team_can_edit_clients(shop_id) then return 'denied'; end if;
  select c.name,c.phone into customer from public.barberflow_clients c
    where c.establishment_id=shop_id and c.id=selected_client and c.active for share;
  if not found then return 'invalid_client'; end if;
  result := public.barberflow_create_walk_in(shop_id,sale_id,customer.name,customer.phone,selections);
  if result is distinct from 'ok' then return result; end if;
  update barberflow_private.counter_sales s set client_id=selected_client
    where s.shop=shop_id and s.id=sale_id and s.walk_in_professional=person and s.client_id is null and s.state='open';
  if not found and not exists(select 1 from barberflow_private.counter_sales s
    where s.shop=shop_id and s.id=sale_id and s.walk_in_professional=person and s.client_id=selected_client)
  then return 'denied'; end if;
  return 'ok';
end;
$$;
revoke all on function public.barberflow_create_registered_walk_in(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.barberflow_create_registered_walk_in(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.barberflow_client_visit_details(shop uuid, client uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with allowed as (
    select c.id,c.establishment_id,barberflow_private.client_contact_digits(c.phone) as phone from public.barberflow_clients c where c.establishment_id=shop and c.id=client
      and (public.barberflow_team_can_edit_clients(shop)
        or exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()))
  ), contact as (
    select c.* from allowed c where c.phone is not null
      and not exists(select 1 from public.barberflow_clients other
        where other.establishment_id=c.establishment_id and other.id<>c.id
          and barberflow_private.client_contact_digits(other.phone)=c.phone)
  ), linked_appointments as (
    select a.* from public.barberflow_schedule a join allowed c on a.establishment_id=c.establishment_id
    where a.kind='appointment' and (a.client_id=c.id or (a.client_id is null and exists(
      select 1 from contact x where x.phone=barberflow_private.client_contact_digits(a.client_phone))))
  ), visits as (
    select a.* from linked_appointments a where a.state='completed'
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
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'number',n.number,'starts',a.starts_at,'state',a.state,'service',a.service_name,
      'professional',p.name,'matched_by_phone',a.client_id is null,'closed_at',r.closed_at,
      'services',coalesce((select jsonb_agg(jsonb_build_object('name',x.service_name,'cents',x.price_cents) order by x.service_name)
        from public.barberflow_order_services x where x.establishment_id=shop and x.appointment_id=a.id),'[]'),
      'products',coalesce((select jsonb_agg(jsonb_build_object('name',x.product_name,'quantity',x.quantity,'cents',x.line_total_cents) order by x.product_name)
        from public.barberflow_order_products x where x.establishment_id=shop and x.appointment_id=a.id),'[]'),
      'total_cents',coalesce(r.total_cents,a.price_cents+
        coalesce((select sum(x.price_cents) from public.barberflow_order_services x where x.establishment_id=shop and x.appointment_id=a.id),0)+
        coalesce((select sum(x.line_total_cents) from public.barberflow_order_products x where x.establishment_id=shop and x.appointment_id=a.id),0)),
      'paid_cents',coalesce((select sum(x.amount_cents) from barberflow_private.receipt_payments x
        where x.appointment_id=r.appointment_id and x.reversed_at is null),0)
    ) order by a.starts_at desc,a.id)
    from linked_appointments a
    join barberflow_private.appointment_order_numbers n on n.appointment_id=a.id and n.shop=shop
    join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=shop
    left join public.barberflow_receipts r on r.establishment_id=shop and r.appointment_id=a.id
    ),'[]') || coalesce((select jsonb_agg(jsonb_build_object(
      'id',s.id,'number',s.number,'starts',s.created_at at time zone 'America/Sao_Paulo',
      'state',s.state,'service','Avulso','professional',p.name,'matched_by_phone',s.client_id is null,'closed_at',s.paid_at,
      'services',coalesce((select jsonb_agg(jsonb_build_object('name',i->>'name','cents',(i->>'price')::int))
        from jsonb_array_elements(s.items) i where i->>'kind'='service'),'[]'),
      'products',coalesce((select jsonb_agg(jsonb_build_object('name',i->>'name','quantity',(i->>'units')::int,
        'cents',(i->>'units')::int::bigint*(i->>'price')::int))
        from jsonb_array_elements(s.items) i where i->>'kind'='product'),'[]'),
      'total_cents',s.service_cents+s.product_cents,
      'paid_cents',coalesce(f.amount_cents,0)
    ) order by s.created_at desc,s.id)
    from allowed c join barberflow_private.counter_sales s on s.shop=c.establishment_id
      and (s.client_id=c.id or (s.client_id is null and exists(
        select 1 from contact x where barberflow_private.client_contact_digits(s.phone)=x.phone)))
    left join public.barberflow_professionals p on p.establishment_id=s.shop and p.id=s.walk_in_professional
    left join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null),'[]'),
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

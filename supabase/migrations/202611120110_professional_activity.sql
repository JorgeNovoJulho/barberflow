alter table barberflow_private.professional_day add column started_at timestamptz;

create or replace function public.barberflow_set_professional_day(shop_id uuid, available_now boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare person uuid := barberflow_private.individual_professional(shop_id);
begin
  if person is null or available_now is null then return false; end if;
  insert into barberflow_private.professional_day as d (shop,professional,day,available,started_at)
    values(shop_id,person,(now() at time zone 'America/Sao_Paulo')::date,available_now,case when available_now then now() end)
  on conflict(shop,professional,day) do update set available=excluded.available,
    started_at=case when excluded.available and d.available then coalesce(d.started_at,excluded.started_at)
                    else excluded.started_at end;
  return true;
end;
$$;

create function public.barberflow_working_professionals(shop_id uuid)
returns table(id uuid,name text,photo_url text,started_at timestamptz)
language sql stable security definer set search_path='' as $$
  select p.id,p.name,p.photo_url,d.started_at
  from barberflow_private.professional_day d
  join public.barberflow_professionals p on p.establishment_id=d.shop and p.id=d.professional
  where d.shop=shop_id and d.day=(now() at time zone 'America/Sao_Paulo')::date and d.available and p.active
    and exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid())
  order by p.name,p.id;
$$;
revoke all on function public.barberflow_working_professionals(uuid) from public,anon;
grant execute on function public.barberflow_working_professionals(uuid) to authenticated;

create or replace function public.barberflow_professional_panel(shop_id uuid, period text)
returns jsonb language sql stable security definer set search_path='' as $$
  with identity as (
    select p.*,e.name as business,e.profile_details->>'cover' as cover,(now() at time zone 'America/Sao_Paulo')::date as today
    from public.barberflow_professionals p join public.barberflow_establishments e on e.id=p.establishment_id
    where p.establishment_id=shop_id and p.id=barberflow_private.individual_professional(shop_id)
      and period in ('dia','semana','quinzena','mes')
  ), bounds as (
    select i.*,case period when 'semana' then date_trunc('week',today)::date
      when 'quinzena' then date_trunc('month',today)::date+case when extract(day from today)>15 then 15 else 0 end
      when 'mes' then date_trunc('month',today)::date else today end as first
    from identity i
  ), appointments as (
    select s.* from public.barberflow_schedule s join bounds i on i.id=s.professional_id and i.establishment_id=s.establishment_id
    where s.kind='appointment' and s.starts_at>=i.first and s.starts_at<i.today+1
  ), paid as (
    select r.*, a.starts_at
    from appointments a join public.barberflow_receipts r on r.appointment_id=a.id and r.establishment_id=shop_id
    where a.state='completed' and r.total_cents <= coalesce((select sum(m.amount_cents)
      from barberflow_private.receipt_payments m where m.appointment_id=a.id and m.reversed_at is null),0)
  )
  select jsonb_build_object('name',i.name,'business',i.business,'photo',i.photo_url,'cover',i.cover,
    'service_rate',i.commission_bps,'product_rate',i.product_commission_bps,'today',i.today,
    'day_started',exists(select 1 from barberflow_private.professional_day d where d.shop=shop_id and d.professional=i.id and d.day=i.today and d.available),'available',coalesce((select d.available from barberflow_private.professional_day d
      where d.shop=shop_id and d.professional=i.id and d.day=i.today),true),
    'services',coalesce((select jsonb_agg(s.name order by s.name) from public.barberflow_professional_services ps
      join public.barberflow_services s on s.establishment_id=ps.establishment_id and s.id=ps.service_id
      where ps.establishment_id=shop_id and ps.professional_id=i.id and s.active),'[]'),
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'client',a.client_name,'phone',a.client_phone,
      'service',a.service_name,'starts',a.starts_at,'state',a.state) order by a.starts_at,a.id)
      from appointments a where a.starts_at>=i.today),'[]'),
    'attended',(select count(*) from appointments where state='completed'),
    'absent',(select count(*) from appointments where state='no_show'),
    'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.weekday,h.hour) from (
      select extract(isodow from starts_at)::int as weekday,extract(hour from starts_at)::int as hour,count(*) as quantity
      from appointments where state='completed' group by 1,2) h),'[]'),
    'paid_services',(select count(*) from paid)+(select count(*) from paid p join public.barberflow_order_services l on l.appointment_id=p.appointment_id and l.establishment_id=shop_id),
    'sold_products',coalesce((select sum(l.quantity) from paid p join public.barberflow_order_products l on l.appointment_id=p.appointment_id and l.establishment_id=shop_id),0),
    'daily', (select jsonb_build_object('services',coalesce(sum(p.service_cents),0),'products',coalesce(sum(p.products_cents),0),
      'service_commission',coalesce(sum(round(p.service_cents::numeric*p.commission_bps/10000)) filter(where not settled.paid),0),
      'product_commission',coalesce(sum(round(p.products_cents::numeric*p.product_commission_bps/10000)) filter(where not settled.paid),0),
      'service_units',count(*)+(select count(*) from paid q join public.barberflow_order_services l on l.appointment_id=q.appointment_id and l.establishment_id=shop_id where q.starts_at>=i.today),
      'product_units',coalesce((select sum(l.quantity) from paid q join public.barberflow_order_products l on l.appointment_id=q.appointment_id and l.establishment_id=shop_id where q.starts_at>=i.today),0))
      from paid p cross join lateral (select exists(select 1 from barberflow_private.commission_receipt_orders o
        where o.shop=shop_id and o.origin='agenda' and o.order_id=p.appointment_id) as paid) settled where p.starts_at>=i.today)
  ) from bounds i;
$$;

revoke all on function barberflow_private.individual_professional(uuid) from public,anon,authenticated;

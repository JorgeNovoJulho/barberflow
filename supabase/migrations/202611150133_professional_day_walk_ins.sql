create or replace view barberflow_private.effective_professional_hours as
  select h.establishment_id,h.professional_id,h.weekday,h.starts_at,h.ends_at,h.break_start,h.break_end
  from public.barberflow_professional_hours h
  join public.barberflow_professionals p on p.establishment_id=h.establishment_id and p.id=h.professional_id
  join public.barberflow_establishments shop on shop.id=h.establishment_id
  where not p.inherit_business_hours
    and (coalesce(shop.profile_details->'hours','{}'::jsonb)='{}'::jsonb
      or (shop.profile_details->'hours'->h.weekday::text->>'start') <
         (shop.profile_details->'hours'->h.weekday::text->>'end'))
  union all
  select p.establishment_id,p.id,d.weekday::smallint,parsed.starts_at,parsed.ends_at,parsed.break_start,parsed.break_end
  from public.barberflow_professionals p
  join public.barberflow_establishments e on e.id=p.establishment_id
  cross join generate_series(0,6) d(weekday)
  cross join lateral (select e.profile_details->'hours'->d.weekday::text as hours) profile
  cross join lateral (
    select
      case when profile.hours->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'start')::time end as starts_at,
      case when profile.hours->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'end')::time end as ends_at,
      case when profile.hours->>'breakStart' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'breakStart')::time end as break_start,
      case when profile.hours->>'breakEnd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then (profile.hours->>'breakEnd')::time end as break_end
  ) parsed
  where p.inherit_business_hours and parsed.starts_at<parsed.ends_at
    and ((coalesce(profile.hours->>'breakStart','')='' and coalesce(profile.hours->>'breakEnd','')='')
      or (parsed.starts_at<parsed.break_start and parsed.break_start<parsed.break_end and parsed.break_end<parsed.ends_at));

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
    'day_started',exists(select 1 from barberflow_private.professional_day d where d.shop=shop_id and d.professional=i.id and d.day=i.today and d.available),'shop_open',exists(select 1 from barberflow_private.effective_professional_hours h
      where h.establishment_id=shop_id and h.professional_id=i.id and h.weekday=extract(dow from i.today)
        and not exists(select 1 from public.barberflow_schedule b
          where b.establishment_id=shop_id and b.professional_id=i.id and b.kind='block'
            and b.starts_at<=i.today+h.starts_at and b.ends_at>=i.today+h.ends_at)),
    'walk_in_active',exists(select 1 from barberflow_private.counter_sales s
      where s.shop=shop_id and s.walk_in_professional=i.id and s.state in ('open','pending')),
    'available',coalesce((select d.available from barberflow_private.professional_day d
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

create function barberflow_private.credit_walk_in_commission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into barberflow_private.counter_commission(sale_id,professional_id,service_bps,product_bps)
  select new.id,p.id,p.commission_bps,p.product_commission_bps
  from public.barberflow_professionals p
  where p.id=new.walk_in_professional and p.establishment_id=new.shop
  on conflict (sale_id) do nothing;
  return new;
end;
$$;
revoke all on function barberflow_private.credit_walk_in_commission() from public,anon,authenticated;
create trigger credit_walk_in_commission after update of state on barberflow_private.counter_sales
for each row when (new.walk_in_professional is not null and new.state='paid' and old.state is distinct from new.state)
execute function barberflow_private.credit_walk_in_commission();

notify pgrst, 'reload schema';

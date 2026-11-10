create table barberflow_private.counter_commission (
  sale_id uuid primary key references barberflow_private.counter_sales(id),
  professional_id uuid not null references public.barberflow_professionals(id),
  service_bps integer not null,
  product_bps integer not null
);
revoke all on barberflow_private.counter_commission from public,anon,authenticated;

create function public.barberflow_assign_counter_commission(shop_id uuid, sale_id uuid, professional uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(barberflow_private.counter_allowed(shop_id),false) then return false; end if;
  insert into barberflow_private.counter_commission(sale_id,professional_id,service_bps,product_bps)
  select s.id,p.id,p.commission_bps,p.product_commission_bps
  from barberflow_private.counter_sales s
  join public.barberflow_professionals p on p.id=professional and p.establishment_id=s.shop
  where s.id=sale_id and s.shop=shop_id and s.state='paid'
  on conflict on constraint counter_commission_pkey do nothing;
  return found;
end;
$$;

create table barberflow_private.commission_receipts (
  id uuid primary key default gen_random_uuid(),
  shop uuid not null references public.barberflow_establishments(id),
  professional uuid not null references public.barberflow_professionals(id),
  issued_at timestamptz not null default now(),
  document jsonb not null
);
create table barberflow_private.commission_receipt_orders (
  shop uuid not null,
  origin text not null,
  order_id uuid not null,
  receipt_id uuid not null references barberflow_private.commission_receipts(id),
  primary key(shop,origin,order_id)
);
revoke all on barberflow_private.commission_receipts,barberflow_private.commission_receipt_orders from public,anon,authenticated;

create function public.barberflow_commission_report(shop_id uuid, period text, reference_day date)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select e.name, e.checkout_timezone as tz,
      coalesce(reference_day,(now() at time zone e.checkout_timezone)::date) as day
    from public.barberflow_establishments e where e.id=shop_id
      and barberflow_private.counter_allowed(shop_id) and period in ('dia','semana','quinzena','mes')
  ), dates as (
    select name,tz,
      case period when 'semana' then date_trunc('week',day)::date
        when 'quinzena' then date_trunc('month',day)::date+case when extract(day from day)>15 then 15 else 0 end
        when 'mes' then date_trunc('month',day)::date else day end as first,
      case period when 'semana' then date_trunc('week',day)::date+7
        when 'quinzena' then case when extract(day from day)<=15 then date_trunc('month',day)::date+15 else (date_trunc('month',day)+interval '1 month')::date end
        when 'mes' then (date_trunc('month',day)+interval '1 month')::date else day+1 end as ending
    from bounds
  ), orders as (
    select r.appointment_id as id,a.professional_id,
      upper(left(r.appointment_id::text,8)) as number,
      r.closed_at as closed,case when a.booked_by is not null then 'online' else 'porta' end as origin,
      jsonb_build_array(jsonb_build_object('name',a.service_name,'kind','service','units',1,'price',r.service_cents))
        || coalesce((select jsonb_agg(jsonb_build_object('name',l.product_name,'kind','product','units',l.quantity,'price',l.unit_price_cents) order by l.product_id)
          from public.barberflow_order_products l where l.appointment_id=r.appointment_id and l.establishment_id=shop_id),'[]') as items,
      round(r.service_cents::numeric*r.commission_bps/10000) as service_commission,
      case when r.products_cents=0 then 0 else round(r.products_cents::numeric*r.product_commission_bps/10000) end as product_commission
    from public.barberflow_receipts r
    join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=r.establishment_id
    cross join dates d
    where r.establishment_id=shop_id and r.closed_at>=d.first::timestamp at time zone d.tz and r.closed_at<d.ending::timestamp at time zone d.tz
    union all
    select s.id,c.professional_id,s.number,s.paid_at,'balcao',s.items,
      round(s.service_cents::numeric*c.service_bps/10000),
      round(s.product_cents::numeric*c.product_bps/10000)
    from barberflow_private.counter_sales s
    join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null
    left join barberflow_private.counter_commission c on c.sale_id=s.id
    cross join dates d
    where s.shop=shop_id and s.state='paid' and s.paid_at>=d.first::timestamp at time zone d.tz and s.paid_at<d.ending::timestamp at time zone d.tz
  )
  select jsonb_build_object('shop',d.name,'timezone',d.tz,'first',d.first,'last',d.ending-1,
    'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('receipt_id',link.receipt_id) order by o.closed,o.id)
      from orders o left join barberflow_private.commission_receipt_orders link
      on link.shop=shop_id and link.order_id=o.id and link.origin=case when o.origin='balcao' then 'balcao' else 'agenda' end),'[]'),
    'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id)
      from public.barberflow_professionals p where p.establishment_id=shop_id),'[]'))
  from dates d;
$$;
revoke all on function public.barberflow_commission_report(uuid,text,date),public.barberflow_assign_counter_commission(uuid,uuid,uuid) from public,anon;
grant execute on function public.barberflow_commission_report(uuid,text,date),public.barberflow_assign_counter_commission(uuid,uuid,uuid) to authenticated;

create function public.barberflow_issue_commission_receipt(shop_id uuid, professional_id uuid, period text, reference_day date, expected_cents bigint)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  report jsonb; included jsonb; professional_name text; receipt uuid; amount bigint;
begin
  if not coalesce(barberflow_private.counter_allowed(shop_id),false) then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(shop_id::text,680));
  report:=public.barberflow_commission_report(shop_id,period,reference_day);
  select p->>'name' into professional_name from jsonb_array_elements(report->'professionals') p where p->>'id'=professional_id::text;
  if professional_name is null then return null; end if;
  select jsonb_agg(o order by o->>'closed',o->>'id'),sum((o->>'service_commission')::bigint+(o->>'product_commission')::bigint)
  into included,amount from jsonb_array_elements(report->'orders') o
  where o->>'professional_id'=professional_id::text
    and o->>'service_commission' is not null and o->>'product_commission' is not null
    and not exists(select 1 from barberflow_private.commission_receipt_orders r
      where r.shop=shop_id and r.origin=case when o->>'origin'='balcao' then 'balcao' else 'agenda' end and r.order_id=(o->>'id')::uuid);
  if coalesce(amount,0)<=0 or amount is distinct from expected_cents then return null; end if;
  insert into barberflow_private.commission_receipts(shop,professional,document)
  values(shop_id,professional_id,(report-'orders'-'professionals')||jsonb_build_object('orders',included,'professional',professional_name,'amount',amount))
  returning id into receipt;
  insert into barberflow_private.commission_receipt_orders(shop,origin,order_id,receipt_id)
  select shop_id,case when o->>'origin'='balcao' then 'balcao' else 'agenda' end,(o->>'id')::uuid,receipt from jsonb_array_elements(included) o;
  return receipt;
end;
$$;

create function public.barberflow_commission_receipts(shop_id uuid, receipt uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when receipt is not null then
    (select r.document||jsonb_build_object('issued_at',r.issued_at) from barberflow_private.commission_receipts r where r.shop=shop_id and r.id=receipt)
  else
    coalesce((select jsonb_agg(to_jsonb(r) order by r.issued_at desc) from (
      select id,issued_at,document->>'professional' as professional,document->>'first' as first,document->>'last' as last
      from barberflow_private.commission_receipts where shop=shop_id order by issued_at desc limit 50
    ) r),'[]')
  end
  where barberflow_private.counter_allowed(shop_id);
$$;
revoke all on function public.barberflow_issue_commission_receipt(uuid,uuid,text,date,bigint),public.barberflow_commission_receipts(uuid,uuid) from public,anon;
grant execute on function public.barberflow_issue_commission_receipt(uuid,uuid,text,date,bigint),public.barberflow_commission_receipts(uuid,uuid) to authenticated;

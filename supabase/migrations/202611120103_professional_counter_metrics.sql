alter table public.barberflow_schedule add column professional_checked_in_at timestamptz;

create function public.barberflow_professional_check_in(shop_id uuid, entry_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare person uuid := barberflow_private.individual_professional(shop_id);
begin
  if person is null then return false; end if;
  update public.barberflow_schedule s
  set professional_checked_in_at=coalesce(s.professional_checked_in_at,now())
  where s.establishment_id=shop_id and s.id=entry_id and s.professional_id=person
    and s.kind='appointment' and s.state='scheduled'
    and s.starts_at::date=(now() at time zone 'America/Sao_Paulo')::date;
  return found;
end;
$$;
revoke all on function public.barberflow_professional_check_in(uuid,uuid) from public,anon;
grant execute on function public.barberflow_professional_check_in(uuid,uuid) to authenticated;

create function public.barberflow_professional_counter_metrics(shop_id uuid, period text)
returns jsonb language sql stable security definer set search_path='' as $$
  with context as (
    select barberflow_private.individual_professional(shop_id) as person,
      (now() at time zone e.checkout_timezone)::date as today,e.checkout_timezone as tz
    from public.barberflow_establishments e where e.id=shop_id and period in ('dia','semana','quinzena','mes')
  ), bounds as (
    select c.*,case period when 'semana' then date_trunc('week',today)::date
      when 'quinzena' then date_trunc('month',today)::date+case when extract(day from today)>15 then 15 else 0 end
      when 'mes' then date_trunc('month',today)::date else today end as first
    from context c where c.person is not null
  ), paid as (
    select s.*, c.service_bps,c.product_bps,s.paid_at >= (b.today::timestamp at time zone b.tz) as is_today,
      exists(select 1 from barberflow_private.commission_receipt_orders o
        where o.shop=shop_id and o.origin='balcao' and o.order_id=s.id) as commission_paid
    from bounds b join barberflow_private.counter_commission c on c.professional_id=b.person
    join barberflow_private.counter_sales s on s.id=c.sale_id and s.shop=shop_id and s.state='paid'
    join barberflow_private.finance_settlements f on f.id=s.id and f.entry_id=s.id and f.reversed_at is null
    where s.paid_at >= (b.first::timestamp at time zone b.tz) and s.paid_at < ((b.today+1)::timestamp at time zone b.tz)
  ), lines as (
    select p.is_today, i->>'kind' as kind, (i->>'units')::int as units
    from paid p cross join lateral jsonb_array_elements(p.items) i
  )
  select jsonb_build_object(
    'checked_in',coalesce((select jsonb_agg(a.id) from public.barberflow_schedule a
      where a.establishment_id=shop_id and a.professional_id=bounds.person and a.kind='appointment'
        and a.state='scheduled' and a.professional_checked_in_at is not null
        and a.starts_at::date=(now() at time zone 'America/Sao_Paulo')::date),'[]'),
    'attended_open',(select count(*) from public.barberflow_schedule a
      where a.establishment_id=shop_id and a.professional_id=bounds.person and a.kind='appointment'
        and a.state='scheduled' and a.professional_checked_in_at is not null
        and a.starts_at>=bounds.first and a.starts_at<bounds.today+1),
    'paid_services',(select count(*) from lines where kind='service'),
    'sold_products',(select coalesce(sum(units),0) from lines where kind='product'),
    'daily', jsonb_build_object(
      'services',(select coalesce(sum(service_cents),0) from paid where is_today),
      'products',(select coalesce(sum(product_cents),0) from paid where is_today),
      'service_units',(select count(*) from lines where kind='service' and is_today),
      'product_units',(select coalesce(sum(units),0) from lines where kind='product' and is_today),
      'service_commission',(select coalesce(sum(round(service_cents::numeric*service_bps/10000)),0) from paid where is_today and not commission_paid),
      'product_commission',(select coalesce(sum(round(product_cents::numeric*product_bps/10000)),0) from paid where is_today and not commission_paid)
    )
  ) from bounds;
$$;
revoke all on function public.barberflow_professional_counter_metrics(uuid,text) from public,anon;
grant execute on function public.barberflow_professional_counter_metrics(uuid,text) to authenticated;

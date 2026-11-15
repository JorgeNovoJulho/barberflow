create table barberflow_private.cash_closings (
  shop uuid not null references public.barberflow_establishments(id) on delete cascade,
  business_day date not null,
  closed_at timestamptz not null default now(),
  closed_by uuid not null,
  totals jsonb not null,
  primary key (shop, business_day)
);

create function public.barberflow_close_cash(shop_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  local_now timestamp;
  report jsonb;
begin
  if barberflow_private.counter_allowed(shop_id) is not true then return 'denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cash-closing:' || shop_id::text, 0));
  lock table barberflow_private.counter_sales, public.barberflow_schedule,
    public.barberflow_receipts, public.barberflow_order_products in share mode nowait;
  local_now := statement_timestamp() at time zone barberflow_private.counter_timezone(shop_id);
  if exists(select 1 from barberflow_private.counter_sales s
       where s.shop=shop_id and s.state in ('open','pending'))
     or exists(select 1 from public.barberflow_schedule a
       where a.establishment_id=shop_id and a.kind='appointment'
         and (a.state='completed' or (a.state='scheduled' and (
           a.professional_checked_in_at is not null or exists(
             select 1 from public.barberflow_order_products p where p.establishment_id=shop_id and p.appointment_id=a.id
           ))))
         and not exists(select 1 from public.barberflow_receipts r
           where r.establishment_id=shop_id and r.appointment_id=a.id))
  then return 'open_orders'; end if;

  report := public.barberflow_counter_report(shop_id,'dia','ambos',0);
  if report is null then return 'denied'; end if;
  insert into barberflow_private.cash_closings(shop,business_day,closed_by,totals)
    values(shop_id,local_now::date,auth.uid(),report-'rows')
    on conflict (shop,business_day) do update
      set closed_at=excluded.closed_at,closed_by=excluded.closed_by,totals=excluded.totals;
  return 'closed';
exception when lock_not_available then return 'busy';
end;
$$;
revoke all on function public.barberflow_close_cash(uuid) from public,anon;
grant execute on function public.barberflow_close_cash(uuid) to authenticated;

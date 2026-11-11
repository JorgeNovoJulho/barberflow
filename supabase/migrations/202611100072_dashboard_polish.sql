alter table public.barberflow_schedule add column booking_cleared_at timestamptz;
grant select(booking_cleared_at) on public.barberflow_schedule to authenticated;

create function public.barberflow_clear_booking_notifications(shop uuid, seen_until timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.barberflow_schedule a set booking_cleared_at=now()
  where a.establishment_id=shop and (a.booked_by is not null or a.guest_online)
    and seen_until is not null and a.booking_created_at<=least(seen_until,now())
    and a.booking_cleared_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
$$;
revoke all on function public.barberflow_clear_booking_notifications(uuid,timestamptz) from public,anon;
grant execute on function public.barberflow_clear_booking_notifications(uuid,timestamptz) to authenticated;

create or replace function public.barberflow_booking_notifications(shop uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bookings as (
    select a.id,a.client_name,a.service_name,a.starts_at,a.booking_created_at,a.booking_read_at
    from public.barberflow_schedule a
    where a.establishment_id=shop and (a.booked_by is not null or a.guest_online) and a.booking_created_at is not null and a.booking_cleared_at is null
  ), recent as (
    select * from (select bookings.*,row_number() over (
      partition by (booking_read_at is null) order by booking_created_at desc,id
    ) as notice_rank from bookings) ranked where notice_rank<=30
  )
  select jsonb_build_object(
    'unread',(select count(*) from bookings where booking_read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(r) order by (r.booking_read_at is null) desc,r.booking_created_at desc,r.id) from recent r),'[]'::jsonb),
    'as_of',now()
  );
$$;

create or replace function public.barberflow_read_booking_notifications(shop uuid, seen_until timestamptz)
returns void language sql security definer set search_path='' as $$
  update public.barberflow_schedule a set booking_read_at=now()
  where a.establishment_id=shop and (a.booked_by is not null or a.guest_online)
    and a.booking_created_at<=least(seen_until,now()) and a.booking_read_at is null
    and seen_until is not null and a.booking_cleared_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
$$;

create or replace function public.barberflow_finance_entries(shop uuid, expense_view text)
returns jsonb language sql stable security definer set search_path='' as $$
  with entries as (
    select e.id,e.direction,e.description,e.category,e.expense_type,e.due_on,e.amount_cents,
      coalesce(sum(s.amount_cents) filter(where s.reversed_at is null),0) as settled_cents
    from barberflow_private.finance_entries e left join barberflow_private.finance_settlements s on s.entry_id=e.id
    where e.establishment_id=shop and barberflow_private.finance_unlocked(shop) group by e.id
  ), recent as (
    select * from entries where (expense_view='receivables' and direction='in')
      or (direction='out' and expense_type is not distinct from nullif(expense_view,'unclassified'))
    order by (amount_cents>settled_cents) desc,due_on desc,id limit 100
  )
  select jsonb_build_object(
    'payable_by_type',coalesce((select jsonb_object_agg(class,balance) from (
      select coalesce(expense_type,'unclassified') as class,sum(greatest(amount_cents-settled_cents,0)) as balance
      from entries where direction='out' group by expense_type
    ) totals),'{}'::jsonb),
    'payable',coalesce((select sum(amount_cents-settled_cents) from entries where direction='out'),0),
    'receivable',coalesce((select sum(amount_cents-settled_cents) from entries where direction='in'),0),
    'unclassified',exists(select 1 from entries where direction='out' and expense_type is null),
    'entries',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('settlements',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'amount_cents',s.amount_cents,'recorded_at',s.recorded_at,
        'reversed_at',s.reversed_at,'reversal_reason',s.reversal_reason) order by s.recorded_at desc,s.id)
      from barberflow_private.finance_settlements s where s.entry_id=r.id
    ),'[]'::jsonb)) order by (r.amount_cents>r.settled_cents) desc,r.due_on desc,r.id) from recent r),'[]'::jsonb))
  where barberflow_private.finance_unlocked(shop);
$$;

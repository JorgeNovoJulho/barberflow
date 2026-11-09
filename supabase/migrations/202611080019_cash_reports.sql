create table barberflow_private.finance_entries (
  id uuid primary key,
  establishment_id uuid not null references public.barberflow_establishments(id),
  direction text not null check (direction in ('in','out')),
  description text not null check (char_length(btrim(description)) between 1 and 160),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  due_on date not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 99999999),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index finance_entries_shop_due on barberflow_private.finance_entries(establishment_id,due_on);
create table barberflow_private.finance_settlements (
  id uuid primary key,
  entry_id uuid not null references barberflow_private.finance_entries(id),
  amount_cents bigint not null check (amount_cents > 0),
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text check (char_length(btrim(reversal_reason)) between 1 and 240)
);
create index finance_settlements_entry on barberflow_private.finance_settlements(entry_id);
alter table barberflow_private.finance_entries enable row level security;
alter table barberflow_private.finance_settlements enable row level security;
revoke all on barberflow_private.finance_entries,barberflow_private.finance_settlements from public,anon,authenticated;

create function public.barberflow_add_finance_entry(shop uuid, request_id uuid, entry_direction text,
  entry_description text, entry_category text, due_date date, cents bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.finance_unlocked(shop) or due_date is null
    or due_date not between date '2000-01-01' and date '2099-12-31' then return false; end if;
  insert into barberflow_private.finance_entries(id,establishment_id,direction,description,category,due_on,amount_cents,created_by)
    values(request_id,shop,entry_direction,btrim(entry_description),btrim(entry_category),due_date,cents,(select auth.uid()))
    on conflict(id) do nothing;
  return found or exists(select 1 from barberflow_private.finance_entries e where e.id=request_id and e.establishment_id=shop
    and e.direction=entry_direction and e.description=btrim(entry_description) and e.category=btrim(entry_category)
    and e.due_on=due_date and e.amount_cents=cents);
end;
$$;

create function public.barberflow_settle_finance_entry(shop uuid, entry uuid, request_id uuid, cents bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare total bigint; settled bigint; previous record;
begin
  if not barberflow_private.finance_unlocked(shop) or cents is null or cents<=0 then return false; end if;
  select amount_cents into total from barberflow_private.finance_entries
    where id=entry and establishment_id=shop for update;
  if not found then return false; end if;
  select entry_id,amount_cents into previous from barberflow_private.finance_settlements where id=request_id;
  if found then return previous.entry_id=entry and previous.amount_cents=cents; end if;
  select coalesce(sum(amount_cents),0) into settled from barberflow_private.finance_settlements
    where entry_id=entry and reversed_at is null;
  if cents>total-settled then return false; end if;
  insert into barberflow_private.finance_settlements(id,entry_id,amount_cents,recorded_by)
    values(request_id,entry,cents,(select auth.uid())) on conflict(id) do nothing;
  return found;
end;
$$;

create function public.barberflow_reverse_finance_entry(shop uuid, settlement uuid, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.finance_unlocked(shop) or reason is null or char_length(btrim(reason)) not between 1 and 240 then return false; end if;
  perform 1 from barberflow_private.finance_entries e join barberflow_private.finance_settlements s on s.entry_id=e.id
    where e.establishment_id=shop and s.id=settlement for update of e;
  if not found then return false; end if;
  update barberflow_private.finance_settlements set reversed_at=now(),reversed_by=(select auth.uid()),reversal_reason=btrim(reason)
    where id=settlement and reversed_at is null;
  return found;
end;
$$;

create function public.barberflow_finance_entries(shop uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with entries as (
    select e.id,e.direction,e.description,e.category,e.due_on,e.amount_cents,
      coalesce(sum(s.amount_cents) filter(where s.reversed_at is null),0) as settled_cents
    from barberflow_private.finance_entries e left join barberflow_private.finance_settlements s on s.entry_id=e.id
    where e.establishment_id=shop and barberflow_private.finance_unlocked(shop) group by e.id
  ), recent as (
    select * from entries order by (amount_cents>settled_cents) desc,due_on desc,id limit 100
  )
  select jsonb_build_object(
    'payable',coalesce((select sum(amount_cents-settled_cents) from entries where direction='out'),0),
    'receivable',coalesce((select sum(amount_cents-settled_cents) from entries where direction='in'),0),
    'entries',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('settlements',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'amount_cents',s.amount_cents,'recorded_at',s.recorded_at,
        'reversed_at',s.reversed_at,'reversal_reason',s.reversal_reason) order by s.recorded_at desc,s.id)
      from barberflow_private.finance_settlements s where s.entry_id=r.id
    ),'[]'::jsonb)) order by (r.amount_cents>r.settled_cents) desc,r.due_on desc,r.id) from recent r),'[]'::jsonb))
  where barberflow_private.finance_unlocked(shop);
$$;

create function public.barberflow_cash_report(shop uuid, first_day date, last_day date, bucket_unit text)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select first_day as start_date,last_day as end_date
    where barberflow_private.finance_unlocked(shop) and last_day>=first_day
      and last_day-first_day<=365 and bucket_unit in ('day','week','month')
  ), events as (
    select event_at,amount,description
    from bounds b
    cross join lateral (
      select v.event_at,v.amount, case when v.reversal then 'Estorno de comanda · ' else 'Comanda · ' end||a.client_name as description
      from public.barberflow_receipts r join public.barberflow_schedule a on a.id=r.appointment_id
      join barberflow_private.receipt_payments p on p.appointment_id=r.appointment_id
      cross join lateral (values(p.recorded_at,p.amount_cents,false),(p.reversed_at,-p.amount_cents,true)) v(event_at,amount,reversal)
      where r.establishment_id=shop
      union all
      select v.event_at,v.amount,case when v.reversal then 'Estorno · '||e.description else e.description end
      from barberflow_private.finance_entries e join barberflow_private.finance_settlements s on s.entry_id=e.id
      cross join lateral (values(s.recorded_at,s.amount_cents,false),(s.reversed_at,-s.amount_cents,true)) v(event_at,amount,reversal)
      where e.establishment_id=shop and e.direction='in'
      union all
      select v.event_at,v.amount,case when v.reversal then 'Estorno · '||e.description else e.description end
      from barberflow_private.finance_entries e join barberflow_private.finance_settlements s on s.entry_id=e.id
      cross join lateral (values(s.recorded_at,-s.amount_cents,false),(s.reversed_at,s.amount_cents,true)) v(event_at,amount,reversal)
      where e.establishment_id=shop and e.direction='out'
    ) movements
    where event_at < ((b.end_date+1)::timestamp at time zone 'America/Sao_Paulo')
  ), period_events as (
    select (event_at at time zone 'America/Sao_Paulo')::date as day,amount,description
    from events cross join bounds b where event_at >= (b.start_date::timestamp at time zone 'America/Sao_Paulo')
  ), totals as (
    select coalesce(sum(amount) filter(where amount>0),0) as income,
      coalesce(-sum(amount) filter(where amount<0),0) as expense
    from period_events
  ), buckets as (
    select date_trunc(bucket_unit,day::timestamp)::date as day,
      coalesce(sum(amount) filter(where amount>0),0) as income,
      coalesce(-sum(amount) filter(where amount<0),0) as expense
    from period_events group by 1
  ), series as (
    select days.bucket::date as day,coalesce(k.income,0) as income,coalesce(k.expense,0) as expense
    from bounds b cross join lateral generate_series(date_trunc(bucket_unit,b.start_date::timestamp),
      date_trunc(bucket_unit,b.end_date::timestamp),case bucket_unit when 'month' then interval '1 month'
        when 'week' then interval '1 week' else interval '1 day' end) days(bucket)
    left join buckets k on k.day=days.bucket::date
  ), opening as (
    select coalesce(sum(e.amount),0) as balance
    from events e cross join bounds b where e.event_at < (b.start_date::timestamp at time zone 'America/Sao_Paulo')
  )
  select jsonb_build_object('income',t.income,'expense',t.expense,'opening',o.balance,'closing',o.balance+t.income-t.expense,
    'planned_in',coalesce((select sum(amount_cents) from barberflow_private.finance_entries
      where establishment_id=shop and direction='in' and due_on between start_date and end_date),0),
    'planned_out',coalesce((select sum(amount_cents) from barberflow_private.finance_entries
      where establishment_id=shop and direction='out' and due_on between start_date and end_date),0),
    'series',coalesce((select jsonb_agg(to_jsonb(s) order by s.day) from series s),'[]'::jsonb),
    'top_in',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from period_events where amount>0 order by amount desc,day desc,description limit 10
    ) x),'[]'::jsonb),
    'top_out',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from period_events where amount<0 order by amount,day desc,description limit 10
    ) x),'[]'::jsonb))
  from bounds cross join totals t cross join opening o;
$$;

revoke all on function public.barberflow_add_finance_entry(uuid,uuid,text,text,text,date,bigint),
  public.barberflow_settle_finance_entry(uuid,uuid,uuid,bigint),public.barberflow_reverse_finance_entry(uuid,uuid,text),
  public.barberflow_finance_entries(uuid),public.barberflow_cash_report(uuid,date,date,text) from public,anon;
grant execute on function public.barberflow_add_finance_entry(uuid,uuid,text,text,text,date,bigint),
  public.barberflow_settle_finance_entry(uuid,uuid,uuid,bigint),public.barberflow_reverse_finance_entry(uuid,uuid,text),
  public.barberflow_finance_entries(uuid),public.barberflow_cash_report(uuid,date,date,text) to authenticated;

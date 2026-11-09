alter table barberflow_private.finance_entries add column expense_type text
  check (expense_type is null or (direction='out' and expense_type in ('fixed','variable','reinvestment')));

drop function public.barberflow_add_finance_entry(uuid,uuid,text,text,text,date,bigint);

create function public.barberflow_add_finance_entry(shop uuid, request_id uuid, entry_direction text,
  entry_description text, entry_category text, due_date date, cents bigint, expense_class text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.finance_unlocked(shop) or due_date is null
    or due_date not between date '2000-01-01' and date '2099-12-31' then return false; end if;
  if entry_direction='out' and (expense_class is null or expense_class not in ('fixed','variable','reinvestment'))
    or entry_direction='in' and expense_class is not null then return false; end if;
  insert into barberflow_private.finance_entries(id,establishment_id,direction,description,category,due_on,amount_cents,expense_type,created_by)
    values(request_id,shop,entry_direction,btrim(entry_description),btrim(entry_category),due_date,cents,expense_class,(select auth.uid()))
    on conflict(id) do nothing;
  return found or exists(select 1 from barberflow_private.finance_entries e where e.id=request_id and e.establishment_id=shop
    and e.direction=entry_direction and e.description=btrim(entry_description) and e.category=btrim(entry_category)
    and e.due_on=due_date and e.amount_cents=cents and e.expense_type is not distinct from expense_class);
end;
$$;

create function public.barberflow_finance_entries(shop uuid, expense_view text)
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

create function public.barberflow_classify_expense(shop uuid, entry uuid, expense_class text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.finance_unlocked(shop) or expense_class is null
    or expense_class not in ('fixed','variable','reinvestment') then return false; end if;
  update barberflow_private.finance_entries set expense_type=expense_class
    where id=entry and establishment_id=shop and direction='out';
  return found;
end;
$$;

revoke all on function public.barberflow_add_finance_entry(uuid,uuid,text,text,text,date,bigint,text),
  public.barberflow_finance_entries(uuid,text),public.barberflow_classify_expense(uuid,uuid,text) from public,anon;
grant execute on function public.barberflow_add_finance_entry(uuid,uuid,text,text,text,date,bigint,text),
  public.barberflow_finance_entries(uuid,text),public.barberflow_classify_expense(uuid,uuid,text) to authenticated;

create function public.barberflow_edit_expense(shop uuid, entry uuid, entry_description text, entry_category text,
  due_date date, cents bigint, expense_class text)
returns boolean language plpgsql security definer set search_path='' as $$
declare paid bigint;
begin
  if not barberflow_private.finance_unlocked(shop) or cents is null or cents not between 1 and 99999999
    or due_date is null or expense_class is null or expense_class not in ('fixed','variable','reinvestment') then return false; end if;
  perform 1 from barberflow_private.finance_entries e where e.id=entry and e.establishment_id=shop and e.direction='out' for update;
  if not found then return false; end if;
  select coalesce(sum(s.amount_cents),0) into paid from barberflow_private.finance_settlements s where s.entry_id=entry and s.reversed_at is null;
  if cents < paid then return false; end if;
  update barberflow_private.finance_entries set description=entry_description,category=entry_category,
    due_on=due_date,amount_cents=cents,expense_type=expense_class where id=entry and establishment_id=shop;
  return found;
end;
$$;
create function public.barberflow_delete_expense(shop uuid, entry uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not barberflow_private.finance_unlocked(shop) then return false; end if;
  perform 1 from barberflow_private.finance_entries e where e.id=entry and e.establishment_id=shop and e.direction='out' for update;
  if not found or exists(select 1 from barberflow_private.finance_settlements s where s.entry_id=entry) then return false; end if;
  delete from barberflow_private.finance_entries where id=entry and establishment_id=shop;
  return found;
end;
$$;
create function public.barberflow_due_expense_notices(shop uuid)
returns table(id uuid,description text,due_on date,expense_type text)
language sql stable security definer set search_path='' as $$
  select e.id,e.description,e.due_on,e.expense_type
  from barberflow_private.finance_entries e
  join public.barberflow_establishments b on b.id=e.establishment_id
  cross join lateral (select (now() at time zone b.checkout_timezone)::date as today) d
  where b.id=shop and barberflow_private.finance_unlocked(shop)
    and e.direction='out' and e.expense_type in ('fixed','variable')
    and e.due_on between d.today and d.today+3
    and e.amount_cents > coalesce((select sum(s.amount_cents) from barberflow_private.finance_settlements s
      where s.entry_id=e.id and s.reversed_at is null),0)
  order by e.due_on,e.id;
$$;
revoke all on function public.barberflow_edit_expense(uuid,uuid,text,text,date,bigint,text),
  public.barberflow_delete_expense(uuid,uuid),public.barberflow_due_expense_notices(uuid) from public,anon;
grant execute on function public.barberflow_edit_expense(uuid,uuid,text,text,date,bigint,text),
  public.barberflow_delete_expense(uuid,uuid),public.barberflow_due_expense_notices(uuid) to authenticated;

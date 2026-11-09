alter table public.barberflow_clients add column created_at timestamptz;
alter table public.barberflow_clients alter column created_at set default now();

create function public.barberflow_client_directory(shop uuid, search_text text, return_days integer, sort_by text)
returns table(id uuid,name text,phone text,preferences text,notes text,active boolean,
  last_visit date,visits bigint,billed_cents numeric)
language sql stable security invoker set search_path='' as $$
  select c.id,c.name,c.phone,c.preferences,c.notes,c.active,
    stats.last_visit,stats.visits,stats.billed_cents
  from public.barberflow_clients c
  cross join lateral (
    select max(a.starts_at)::date as last_visit,count(*) as visits,coalesce(sum(r.total_cents),0) as billed_cents
    from public.barberflow_schedule a
    left join public.barberflow_receipts r on r.appointment_id=a.id and r.establishment_id=shop
    where a.establishment_id=shop and a.client_id=c.id and a.kind='appointment' and a.state='completed'
  ) stats
  where c.establishment_id=shop
    and char_length(search_text)<=120
    and (search_text='' or strpos(lower(c.name),lower(search_text))>0)
    and (return_days=0 or (return_days in (15,20,30,45,60,90) and c.active
      and stats.last_visit<=(now() at time zone 'America/Sao_Paulo')::date-return_days))
  order by case when sort_by='spend' then stats.billed_cents end desc nulls last,
    case when sort_by='recent' then c.created_at end desc nulls last,
    case when sort_by='visit' then stats.last_visit end desc nulls last,c.name,c.id
  limit 100;
$$;

revoke all on function public.barberflow_client_directory(uuid,text,integer,text) from public,anon;
grant execute on function public.barberflow_client_directory(uuid,text,integer,text) to authenticated;

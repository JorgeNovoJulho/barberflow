alter table barberflow_private.team_access
  add column read_finance boolean not null default false,
  drop constraint team_access_scope,
  add constraint team_access_scope check(professional_id is not null or see_all or manage_clients or manage_services or manage_professionals or read_finance);

drop function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean,boolean);
drop function public.barberflow_team_members(uuid);

create function public.barberflow_invite_team(shop uuid, invite_email text, professional uuid, see_agendas boolean, manage_agendas boolean, edit_clients boolean, edit_services boolean, edit_professionals boolean, view_finance boolean)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); normalized text:=lower(btrim(invite_email));
begin
  if normalized is null or char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or see_agendas is null or manage_agendas is null or edit_clients is null or edit_services is null or edit_professionals is null or view_finance is null or (professional is null and not (see_agendas or manage_agendas or edit_clients or edit_services or edit_professionals or view_finance)) then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  if professional is not null and not exists(select 1 from public.barberflow_professionals p
    where p.id=professional and p.establishment_id=shop and p.active) then return null; end if;
  insert into barberflow_private.team_access(establishment_id,email,professional_id,see_all,manage_all,manage_clients,manage_services,manage_professionals,read_finance,token_hash)
  values(shop,normalized,professional,see_agendas or manage_agendas,manage_agendas,edit_clients,edit_services,edit_professionals,view_finance,extensions.digest(token,'sha256'))
  on conflict(establishment_id,email) where revoked_at is null do update
    set professional_id=excluded.professional_id,see_all=excluded.see_all,manage_all=excluded.manage_all,manage_clients=excluded.manage_clients,manage_services=excluded.manage_services,manage_professionals=excluded.manage_professionals,read_finance=excluded.read_finance,
      token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where team_access.accepted_at is null;
  return case when found then token end;
end;
$$;

create function public.barberflow_team_members(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,manage_clients boolean,manage_services boolean,manage_professionals boolean,read_finance boolean,expires_at timestamptz,accepted_at timestamptz)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.manage_clients,t.manage_services,t.manage_professionals,t.read_finance,t.expires_at,t.accepted_at
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;

create table barberflow_private.team_finance_access (
  member_id uuid primary key references barberflow_private.team_access(id) on delete cascade,
  password_hash text not null,
  failed_attempts integer not null default 0,
  blocked_until timestamptz
);
create table barberflow_private.team_finance_sessions (
  member_id uuid not null references barberflow_private.team_finance_access(member_id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  primary key(member_id,session_id)
);
revoke all on barberflow_private.team_finance_access,barberflow_private.team_finance_sessions from public,anon,authenticated;

create function barberflow_private.finance_delegate(shop uuid)
returns uuid language sql stable security definer set search_path='' as $$
  select t.id from barberflow_private.team_access t
  where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.accepted_at is not null
    and t.revoked_at is null and t.read_finance
  order by t.accepted_at desc,t.id limit 1;
$$;

create function barberflow_private.finance_report_unlocked(shop uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select barberflow_private.finance_unlocked(shop) or exists(
    select 1 from barberflow_private.team_finance_sessions s
    where s.member_id=barberflow_private.finance_delegate(shop)
      and s.session_id::text=(select auth.jwt()->>'session_id') and s.expires_at>now());
$$;

create function public.barberflow_team_finance_status(shop uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when x.member_id is null then 'denied'
    when barberflow_private.finance_report_unlocked(shop) then 'unlocked'
    when exists(select 1 from barberflow_private.team_finance_access a where a.member_id=x.member_id) then 'locked'
    else 'setup' end
  from (select barberflow_private.finance_delegate(shop) as member_id) x;
$$;

create function public.barberflow_team_finance_unlock(shop uuid, secret text, setup boolean)
returns text language plpgsql security definer set search_path='' as $$
declare membership uuid:=barberflow_private.finance_delegate(shop); access_row record; current_session text := (select auth.jwt()->>'session_id');
begin
  if membership is null or current_session is null then return 'denied'; end if;
  if secret is null or char_length(secret)<8 or octet_length(secret)>72 then return 'invalid'; end if;
  if setup then
    insert into barberflow_private.team_finance_access(member_id,password_hash)
      values(membership,extensions.crypt(secret,extensions.gen_salt('bf',10))) on conflict do nothing;
    if not found then return 'locked'; end if;
  end if;
  select * into access_row from barberflow_private.team_finance_access where member_id=membership for update;
  if not found then return 'setup'; end if;
  if access_row.blocked_until>now() then return 'blocked'; end if;
  if not setup and extensions.crypt(secret,access_row.password_hash)<>access_row.password_hash then
    update barberflow_private.team_finance_access
      set failed_attempts=case when access_row.blocked_until is not null then 1 else access_row.failed_attempts+1 end,
          blocked_until=case when access_row.blocked_until is null and access_row.failed_attempts>=4 then now()+interval '15 minutes' else null end
      where member_id=membership;
    return 'invalid';
  end if;
  update barberflow_private.team_finance_access set failed_attempts=0,blocked_until=null where member_id=membership;
  delete from barberflow_private.team_finance_sessions where member_id=membership and expires_at<=now();
  insert into barberflow_private.team_finance_sessions(member_id,session_id,expires_at)
    values(membership,current_session::uuid,now()+interval '15 minutes')
  on conflict(member_id,session_id) do update set expires_at=excluded.expires_at;
  return 'unlocked';
end;
$$;

create function public.barberflow_team_finance_lock(shop uuid)
returns void language sql security definer set search_path='' as $$
  delete from barberflow_private.team_finance_sessions s
  where s.member_id=barberflow_private.finance_delegate(shop) and s.session_id::text=(select auth.jwt()->>'session_id');
$$;

create function public.barberflow_team_report_professionals(shop uuid)
returns table(id uuid,name text,active boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.name,p.active from public.barberflow_professionals p
  where p.establishment_id=shop and barberflow_private.finance_delegate(shop) is not null
    and barberflow_private.finance_report_unlocked(shop)
  order by p.name,p.id;
$$;

create or replace function public.barberflow_cash_report(shop uuid, first_day date, last_day date, bucket_unit text)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select first_day as start_date,last_day as end_date
    where barberflow_private.finance_report_unlocked(shop) and last_day>=first_day
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

create or replace function public.barberflow_performance_report(shop uuid, first_day date, last_day date, professional uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select first_day::timestamp as start_at,(last_day+1)::timestamp as end_at
    where barberflow_private.finance_report_unlocked(shop) and first_day between date '2000-01-01' and date '2099-12-31'
      and last_day between first_day and date '2099-12-31' and last_day-first_day<=365
  ), sales as (
    select (r.closed_at at time zone 'America/Sao_Paulo')::date as day,
      r.appointment_id,r.total_cents,r.service_cents,r.products_cents,r.commission_bps,r.product_commission_bps,
      a.service_id,a.service_name,a.professional_id,p.name as professional_name
    from bounds b
    join public.barberflow_receipts r on r.establishment_id=shop
      and r.closed_at >= (b.start_at at time zone 'America/Sao_Paulo')
      and r.closed_at < (b.end_at at time zone 'America/Sao_Paulo')
    join public.barberflow_schedule a on a.id=r.appointment_id and a.establishment_id=shop
    join public.barberflow_professionals p on p.id=a.professional_id and p.establishment_id=shop
    where professional is null or a.professional_id=professional
  ), by_day as (
    select day,sum(total_cents) as cents from sales group by day
  ), by_professional as (
    select professional_id,professional_name as name,count(*) as quantity,sum(total_cents) as cents,
      count(*) filter(where commission_bps is null) as untracked,
      coalesce(sum(round(service_cents::numeric*commission_bps/10000)),0) as commission_cents,
      count(*) filter(where products_cents>0 and product_commission_bps is null) as untracked_products,
      coalesce(sum(round(products_cents::numeric*product_commission_bps/10000)),0) as product_commission_cents
    from sales group by professional_id,professional_name
  ), by_service as (
    select service_id,service_name as name,count(*) as quantity,sum(service_cents) as cents
    from sales group by service_id,service_name
    order by quantity desc,cents desc,service_id,service_name limit 10
  ), by_product as (
    select p.id as product_id,p.name,sum(l.quantity) as quantity,
      sum(l.quantity::bigint*l.unit_price_cents) as cents
    from sales s
    join public.barberflow_order_products l on l.appointment_id=s.appointment_id and l.establishment_id=shop
    join public.barberflow_products p on p.id=l.product_id and p.establishment_id=shop
    group by p.id,p.name
    order by quantity desc,cents desc,p.id limit 10
  ), busy_hours as (
    select extract(dow from a.starts_at)::integer as weekday,extract(hour from a.starts_at)::integer as hour,
      count(*) as quantity
    from bounds b join public.barberflow_schedule a on a.establishment_id=shop
      and a.starts_at>=b.start_at and a.starts_at<b.end_at
    where a.kind='appointment' and a.state='completed' and (professional is null or a.professional_id=professional)
    group by 1,2 order by quantity desc,weekday,hour limit 10
  )
  select jsonb_build_object(
    'quantity',(select count(*) from sales),
    'cents',coalesce((select sum(total_cents) from sales),0),
    'ticket_cents',coalesce((select round(avg(total_cents)) from sales),0),
    'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from by_day d),'[]'::jsonb),
    'professionals',coalesce((select jsonb_agg(to_jsonb(p) order by p.cents desc,p.name,p.professional_id) from by_professional p),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(s) order by s.quantity desc,s.cents desc,s.service_id,s.name) from by_service s),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.quantity desc,p.cents desc,p.product_id) from by_product p),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.quantity desc,h.weekday,h.hour) from busy_hours h),'[]'::jsonb)
  ) from bounds;
$$;

revoke all on function barberflow_private.finance_delegate(uuid),barberflow_private.finance_report_unlocked(uuid)
  from public,anon,authenticated;
revoke all on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_finance_status(uuid),
  public.barberflow_team_finance_unlock(uuid,text,boolean),public.barberflow_team_finance_lock(uuid),
  public.barberflow_team_report_professionals(uuid) from public,anon;
grant execute on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_finance_status(uuid),
  public.barberflow_team_finance_unlock(uuid,text,boolean),public.barberflow_team_finance_lock(uuid),
  public.barberflow_team_report_professionals(uuid) to authenticated;

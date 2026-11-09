alter table barberflow_private.team_access add column manage_all boolean not null default false
  check (not manage_all or see_all);

create function barberflow_private.team_can_manage(shop uuid, professional uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from barberflow_private.team_access t
    join public.barberflow_professionals p on p.id=professional and p.establishment_id=shop and p.active
    where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.accepted_at is not null
      and t.revoked_at is null and (t.manage_all or t.professional_id=professional));
$$;
revoke all on function barberflow_private.team_can_manage(uuid,uuid) from public,anon,authenticated;

drop function public.barberflow_invite_team(uuid,text,uuid,boolean);
drop function public.barberflow_team_members(uuid);

create function public.barberflow_invite_team(shop uuid, invite_email text, professional uuid, see_agendas boolean, manage_agendas boolean)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); normalized text:=lower(btrim(invite_email));
begin
  if normalized is null or char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or see_agendas is null or manage_agendas is null or (professional is null and not (see_agendas or manage_agendas)) then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  if professional is not null and not exists(select 1 from public.barberflow_professionals p
    where p.id=professional and p.establishment_id=shop and p.active) then return null; end if;
  insert into barberflow_private.team_access(establishment_id,email,professional_id,see_all,manage_all,token_hash)
  values(shop,normalized,professional,see_agendas or manage_agendas,manage_agendas,extensions.digest(token,'sha256'))
  on conflict(establishment_id,email) where revoked_at is null do update
    set professional_id=excluded.professional_id,see_all=excluded.see_all,manage_all=excluded.manage_all,
      token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where team_access.accepted_at is null;
  return case when found then token end;
end;
$$;

create function public.barberflow_team_members(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,manage_all boolean,expires_at timestamptz,accepted_at timestamptz)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.manage_all,t.expires_at,t.accepted_at
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;

create or replace function public.barberflow_team_agenda(shop uuid, agenda_day date)
returns table(id uuid,professional_name text,kind text,state text,starts_at timestamp,ends_at timestamp,service_name text,client_name text,can_edit boolean)
language sql stable security definer set search_path='' as $$
  select a.id,p.name,a.kind,a.state,a.starts_at,a.ends_at,a.service_name,a.client_name,
    a.kind='appointment' and p.active and exists(select 1 from barberflow_private.team_access t
      where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.revoked_at is null
        and t.accepted_at is not null and (t.manage_all or t.professional_id=a.professional_id))
  from public.barberflow_schedule a
  join public.barberflow_professionals p on p.establishment_id=a.establishment_id and p.id=a.professional_id
  where a.establishment_id=shop and agenda_day between date '2000-01-01' and date '2099-12-31'
    and a.starts_at<(agenda_day+1)::timestamp and a.ends_at>agenda_day::timestamp
    and exists(select 1 from barberflow_private.team_access t
      where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.revoked_at is null and t.accepted_at is not null
        and (t.see_all or (p.active and t.professional_id=a.professional_id)))
  order by a.starts_at,a.id limit 500;
$$;

create or replace function public.barberflow_set_schedule_state(shop uuid, entry uuid, new_state text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.barberflow_schedule s set state=new_state
  where s.establishment_id=shop and s.id=entry
    and ((s.state='scheduled' and (new_state='cancelled' or (s.kind='appointment' and new_state in ('completed','no_show'))))
      or (s.state='pending' and s.kind='appointment' and new_state in ('scheduled','cancelled')))
    and (exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()))
      or (s.kind='appointment' and barberflow_private.team_can_manage(shop,s.professional_id)));
  return found;
end;
$$;

create or replace function public.barberflow_create_schedule_entry(
  shop uuid, professional uuid, service uuid, start_at timestamp, block_end timestamp,
  customer text, phone text, note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  offering record;
  workday record;
  finish timestamp;
  entry_id uuid;
begin
  if not exists (select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid()))
    and (service is null or not barberflow_private.team_can_manage(shop,professional)) then
    raise exception using errcode='42501', message='Establishment unavailable';
  end if;
  perform 1 from public.barberflow_professionals where establishment_id=shop and id=professional and active for share;
  if not found then raise exception using errcode='22023', message='Professional unavailable'; end if;
  if service is null then
    if block_end is null or start_at >= block_end then raise exception using errcode='22023', message='Invalid block'; end if;
    insert into public.barberflow_schedule (establishment_id,professional_id,kind,starts_at,ends_at,notes)
      values (shop,professional,'block',start_at,block_end,coalesce(note,'')) returning id into entry_id;
  else
    select s.name,s.price_cents,s.duration_minutes into offering from public.barberflow_services s
      join public.barberflow_professional_services ps on ps.establishment_id=s.establishment_id and ps.service_id=s.id
      where s.establishment_id=shop and s.id=service and ps.professional_id=professional and s.active
      for share of s, ps;
    if not found then raise exception using errcode='22023', message='Service unavailable for professional'; end if;
    finish := start_at + pg_catalog.make_interval(mins => offering.duration_minutes);
    select * into workday from barberflow_private.effective_professional_hours
      where establishment_id=shop and professional_id=professional and weekday=extract(dow from start_at);
    if not found or start_at::date <> finish::date or start_at::time < workday.starts_at
      or finish::time > workday.ends_at or (workday.break_start is not null
        and start_at::time < workday.break_end and finish::time > workday.break_start) then
      raise exception using errcode='22023', message='Outside working hours';
    end if;
    insert into public.barberflow_schedule
      (establishment_id,professional_id,service_id,kind,starts_at,ends_at,service_name,price_cents,client_name,client_phone,notes)
      values (shop,professional,service,'appointment',start_at,finish,offering.name,offering.price_cents,
        btrim(customer),nullif(btrim(phone),''),coalesce(note,'')) returning id into entry_id;
  end if;
  return entry_id;
end;
$$;

create or replace function public.barberflow_reschedule(shop uuid, entry uuid, new_start timestamp)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  appointment record;
  workday record;
  new_end timestamp;
begin
  if new_start is null or not isfinite(new_start) then
    raise exception using errcode='22023', message='Invalid start';
  end if;
  select * into appointment from public.barberflow_schedule
    where establishment_id=shop and id=entry and kind='appointment' and state='scheduled'
      and (barberflow_private.team_can_manage(shop,professional_id) or exists(select 1 from public.barberflow_establishments
        where id=shop and owner_id=(select auth.uid()))) for update;
  if not found then return false; end if;
  perform 1 from public.barberflow_professionals
    where establishment_id=shop and id=appointment.professional_id and active for share;
  if not found then raise exception using errcode='22023', message='Professional unavailable'; end if;
  new_end := new_start + (appointment.ends_at - appointment.starts_at);
  select * into workday from barberflow_private.effective_professional_hours
    where establishment_id=shop and professional_id=appointment.professional_id
      and weekday=extract(dow from new_start);
  if not found or new_start::date <> new_end::date or new_start::time < workday.starts_at
    or new_end::time > workday.ends_at or (workday.break_start is not null
      and new_start::time < workday.break_end and new_end::time > workday.break_start) then
    raise exception using errcode='22023', message='Outside working hours';
  end if;
  update public.barberflow_schedule set starts_at=new_start, ends_at=new_end where id=entry and establishment_id=shop;
  return found;
end;
$$;

create function public.barberflow_team_offerings(shop uuid)
returns table(professional_id uuid,professional_name text,service_id uuid,service_name text,duration_minutes integer)
language sql stable security definer set search_path='' as $$
  select p.id,p.name,s.id,s.name,s.duration_minutes
  from public.barberflow_professional_services ps
  join public.barberflow_professionals p on p.id=ps.professional_id and p.establishment_id=shop and p.active
  join public.barberflow_services s on s.id=ps.service_id and s.establishment_id=shop and s.active
  where ps.establishment_id=shop and barberflow_private.team_can_manage(shop,p.id)
  order by p.display_order,p.name,p.id,s.display_order,s.name,s.id;
$$;

revoke all on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_offerings(uuid) from public,anon;
grant execute on function public.barberflow_invite_team(uuid,text,uuid,boolean,boolean),
  public.barberflow_team_members(uuid),public.barberflow_team_offerings(uuid) to authenticated;

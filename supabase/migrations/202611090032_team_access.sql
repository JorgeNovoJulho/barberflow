create table barberflow_private.team_access (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.barberflow_establishments(id),
  email text not null check (email=lower(btrim(email)) and char_length(email)<=254),
  professional_id uuid,
  see_all boolean not null default false,
  user_id uuid references auth.users(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  foreign key(establishment_id,professional_id) references public.barberflow_professionals(establishment_id,id),
  check(professional_id is not null or see_all)
);
create unique index barberflow_team_access_email on barberflow_private.team_access(establishment_id,email) where revoked_at is null;
create index barberflow_team_access_user on barberflow_private.team_access(user_id) where revoked_at is null;
revoke all on barberflow_private.team_access from public,anon,authenticated;

create function public.barberflow_invite_team(shop uuid, invite_email text, professional uuid, see_agendas boolean)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=encode(extensions.gen_random_bytes(32),'hex'); normalized text:=lower(btrim(invite_email));
begin
  if normalized is null or char_length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or see_agendas is null or (professional is null and not see_agendas) then return null; end if;
  perform 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()) for update;
  if not found then return null; end if;
  if professional is not null and not exists(select 1 from public.barberflow_professionals p
    where p.id=professional and p.establishment_id=shop and p.active) then return null; end if;
  insert into barberflow_private.team_access(establishment_id,email,professional_id,see_all,token_hash)
  values(shop,normalized,professional,see_agendas,extensions.digest(token,'sha256'))
  on conflict(establishment_id,email) where revoked_at is null do update
    set professional_id=excluded.professional_id,see_all=excluded.see_all,
      token_hash=excluded.token_hash,expires_at=excluded.expires_at
    where team_access.accepted_at is null;
  return case when found then token end;
end;
$$;

create function public.barberflow_accept_team(invite_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare shop uuid;
begin
  if invite_token is null or invite_token !~ '^[0-9a-f]{64}$' then return null; end if;
  update barberflow_private.team_access t set user_id=u.id,accepted_at=now()
  from auth.users u
  where u.id=(select auth.uid()) and u.email_confirmed_at is not null and lower(u.email)=t.email
    and t.token_hash=extensions.digest(invite_token,'sha256') and t.expires_at>now()
    and t.accepted_at is null and t.revoked_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=t.establishment_id and e.owner_id<>u.id)
  returning t.establishment_id into shop;
  return shop;
end;
$$;

create function public.barberflow_revoke_team(shop uuid, member uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update barberflow_private.team_access t set revoked_at=now()
  where t.id=member and t.establishment_id=shop and t.revoked_at is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()));
  return found;
end;
$$;

create function public.barberflow_team_members(shop uuid)
returns table(id uuid,email text,professional_id uuid,see_all boolean,expires_at timestamptz,accepted_at timestamptz)
language sql stable security definer set search_path='' as $$
  select t.id,t.email,t.professional_id,t.see_all,t.expires_at,t.accepted_at
  from barberflow_private.team_access t join public.barberflow_establishments e on e.id=t.establishment_id
  where e.id=shop and e.owner_id=(select auth.uid()) and t.revoked_at is null
  order by t.email;
$$;

create function public.barberflow_my_team_shops()
returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
  select distinct e.id,e.name from barberflow_private.team_access t
  join public.barberflow_establishments e on e.id=t.establishment_id
  where t.user_id=(select auth.uid()) and t.revoked_at is null and t.accepted_at is not null
  order by e.name,e.id;
$$;

create function public.barberflow_team_agenda(shop uuid, agenda_day date)
returns table(id uuid,professional_name text,kind text,state text,starts_at timestamp,ends_at timestamp,service_name text,client_name text,can_edit boolean)
language sql stable security definer set search_path='' as $$
  select a.id,p.name,a.kind,a.state,a.starts_at,a.ends_at,a.service_name,a.client_name,
    a.kind='appointment' and p.active and exists(select 1 from barberflow_private.team_access t
      where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.revoked_at is null
        and t.accepted_at is not null and t.professional_id=a.professional_id)
  from public.barberflow_schedule a
  join public.barberflow_professionals p on p.establishment_id=a.establishment_id and p.id=a.professional_id
  where a.establishment_id=shop and agenda_day between date '2000-01-01' and date '2099-12-31'
    and a.starts_at<(agenda_day+1)::timestamp and a.ends_at>agenda_day::timestamp
    and exists(select 1 from barberflow_private.team_access t
      where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.revoked_at is null and t.accepted_at is not null
        and (t.see_all or (p.active and t.professional_id=a.professional_id)))
  order by a.starts_at,a.id limit 500;
$$;

revoke all on function public.barberflow_invite_team(uuid,text,uuid,boolean),public.barberflow_accept_team(text),
  public.barberflow_revoke_team(uuid,uuid),public.barberflow_team_members(uuid),public.barberflow_my_team_shops(),
  public.barberflow_team_agenda(uuid,date) from public,anon;
grant execute on function public.barberflow_invite_team(uuid,text,uuid,boolean),public.barberflow_accept_team(text),
  public.barberflow_revoke_team(uuid,uuid),public.barberflow_team_members(uuid),public.barberflow_my_team_shops(),
  public.barberflow_team_agenda(uuid,date) to authenticated;

create or replace function public.barberflow_set_schedule_state(shop uuid, entry uuid, new_state text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.barberflow_schedule s set state=new_state
  where s.establishment_id=shop and s.id=entry
    and ((s.state='scheduled' and (new_state='cancelled' or (s.kind='appointment' and new_state in ('completed','no_show'))))
      or (s.state='pending' and s.kind='appointment' and new_state in ('scheduled','cancelled')))
    and (exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()))
      or (s.kind='appointment' and exists(select 1 from barberflow_private.team_access t
        join public.barberflow_professionals p on p.establishment_id=t.establishment_id and p.id=t.professional_id and p.active
        where t.establishment_id=shop and t.user_id=(select auth.uid()) and t.revoked_at is null and t.accepted_at is not null
          and t.professional_id=s.professional_id)));
  return found;
end;
$$;

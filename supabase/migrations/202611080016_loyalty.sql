create table public.barberflow_loyalty_rules (
  establishment_id uuid primary key references public.barberflow_establishments(id),
  enabled boolean not null default false,
  visits_required integer not null check (visits_required between 1 and 100),
  reward text not null check (char_length(btrim(reward)) between 1 and 200),
  service_ids uuid[] not null default '{}'
);

create table public.barberflow_loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null,
  client_id uuid not null,
  reward text not null,
  redeemed_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  foreign key(establishment_id,client_id) references public.barberflow_clients(establishment_id,id)
);
create index barberflow_loyalty_redemptions_shop on public.barberflow_loyalty_redemptions(establishment_id,redeemed_at desc);

create table public.barberflow_loyalty_used_visits (
  appointment_id uuid primary key references public.barberflow_schedule(id),
  redemption_id uuid not null references public.barberflow_loyalty_redemptions(id)
);

alter table public.barberflow_loyalty_rules enable row level security;
alter table public.barberflow_loyalty_redemptions enable row level security;
alter table public.barberflow_loyalty_used_visits enable row level security;
revoke all on public.barberflow_loyalty_rules,public.barberflow_loyalty_redemptions,public.barberflow_loyalty_used_visits from public,anon,authenticated;
grant select on public.barberflow_loyalty_rules,public.barberflow_loyalty_redemptions to authenticated;
create policy "Owner reads loyalty rule" on public.barberflow_loyalty_rules for select to authenticated
using (exists(select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));
create policy "Owner reads loyalty history" on public.barberflow_loyalty_redemptions for select to authenticated
using (exists(select 1 from public.barberflow_establishments e where e.id=establishment_id and e.owner_id=(select auth.uid())));

create function public.barberflow_save_loyalty(shop uuid, active boolean, target integer, benefit text, services uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then
    raise exception using errcode='42501',message='Establishment unavailable';
  end if;
  if services is null or exists(select 1 from unnest(services) item
    where not exists(select 1 from public.barberflow_services s where s.establishment_id=shop and s.id=item)) then
    raise exception using errcode='22023',message='Invalid services';
  end if;
  insert into public.barberflow_loyalty_rules(establishment_id,enabled,visits_required,reward,service_ids)
    values(shop,active,target,btrim(benefit),services)
  on conflict(establishment_id) do update set enabled=excluded.enabled,visits_required=excluded.visits_required,
    reward=excluded.reward,service_ids=excluded.service_ids;
end;
$$;

create function barberflow_private.loyalty_visits(shop uuid, person uuid, services uuid[])
returns table(visit uuid,finished timestamp)
language sql stable security invoker set search_path='' as $$
  select a.id,a.ends_at from public.barberflow_schedule a
  where a.establishment_id=shop and a.client_id=person and a.kind='appointment' and a.state='completed'
    and (cardinality(services)=0 or a.service_id=any(services))
    and not exists(select 1 from public.barberflow_loyalty_used_visits used where used.appointment_id=a.id);
$$;
revoke all on function barberflow_private.loyalty_visits(uuid,uuid,uuid[]) from public,anon,authenticated;

create function public.barberflow_loyalty_progress(shop uuid)
returns table(client_id uuid,client_name text,visits bigint)
language sql stable security definer set search_path='' as $$
  select c.id,c.name,coalesce(progress.visits,0)
  from public.barberflow_establishments e join public.barberflow_loyalty_rules r on r.establishment_id=e.id and r.enabled
  join public.barberflow_clients c on c.establishment_id=e.id and c.active
  cross join lateral (select count(*) as visits from barberflow_private.loyalty_visits(shop,c.id,r.service_ids)) progress
  where e.id=shop and e.owner_id=(select auth.uid())
  order by progress.visits desc,c.name,c.id limit 100;
$$;

create function public.barberflow_redeem_loyalty(shop uuid, person uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare rule record; visits uuid[]; redemption uuid;
begin
  if not exists(select 1 from public.barberflow_establishments where id=shop and owner_id=(select auth.uid())) then return false; end if;
  perform 1 from public.barberflow_clients where establishment_id=shop and id=person and active for update;
  if not found then return false; end if;
  select visits_required,reward,service_ids into rule from public.barberflow_loyalty_rules
    where establishment_id=shop and enabled for share;
  if not found then return false; end if;
  select array(select v.visit from barberflow_private.loyalty_visits(shop,person,rule.service_ids) v
    order by v.finished,v.visit limit rule.visits_required) into visits;
  if cardinality(visits)<rule.visits_required then return false; end if;
  insert into public.barberflow_loyalty_redemptions(establishment_id,client_id,reward,actor_id)
    values(shop,person,rule.reward,(select auth.uid())) returning id into redemption;
  insert into public.barberflow_loyalty_used_visits(appointment_id,redemption_id)
    select unnest(visits),redemption;
  return true;
end;
$$;

revoke all on function public.barberflow_save_loyalty(uuid,boolean,integer,text,uuid[]),
  public.barberflow_loyalty_progress(uuid),public.barberflow_redeem_loyalty(uuid,uuid) from public,anon;
grant execute on function public.barberflow_save_loyalty(uuid,boolean,integer,text,uuid[]),
  public.barberflow_loyalty_progress(uuid),public.barberflow_redeem_loyalty(uuid,uuid) to authenticated;

create function public.barberflow_link_appointment_client(shop uuid, entry uuid, person uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.barberflow_schedule a set client_id=person
  where a.establishment_id=shop and a.id=entry and a.kind='appointment' and a.state='completed'
    and a.client_id is null
    and exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=(select auth.uid()))
    and exists(select 1 from public.barberflow_clients c where c.establishment_id=shop and c.id=person and c.active);
  return found;
end;
$$;
revoke all on function public.barberflow_link_appointment_client(uuid,uuid,uuid) from public,anon;
grant execute on function public.barberflow_link_appointment_client(uuid,uuid,uuid) to authenticated;

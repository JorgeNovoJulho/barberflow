create table barberflow_private.professional_day (
  shop uuid not null,
  professional uuid not null,
  day date not null,
  available boolean not null,
  primary key(shop,professional,day),
  foreign key(shop,professional) references public.barberflow_professionals(establishment_id,id) on delete cascade
);
revoke all on barberflow_private.professional_day from public,anon,authenticated;

create function barberflow_private.individual_professional(shop_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select case when count(distinct t.professional_id)=1 then (array_agg(distinct t.professional_id))[1] end
  from barberflow_private.team_access t
  join public.barberflow_professionals p on p.establishment_id=t.establishment_id and p.id=t.professional_id
  where t.establishment_id=shop_id and t.user_id=auth.uid() and t.accepted_at is not null
    and t.revoked_at is null and p.active;
$$;

create function public.barberflow_set_professional_day(shop_id uuid, available_now boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare person uuid := barberflow_private.individual_professional(shop_id);
begin
  if person is null or available_now is null then return false; end if;
  insert into barberflow_private.professional_day values(shop_id,person,(now() at time zone 'America/Sao_Paulo')::date,available_now)
    on conflict(shop,professional,day) do update set available=excluded.available;
  return true;
end;
$$;

create function public.barberflow_professional_appointment(shop_id uuid, entry_id uuid, operation text, reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare person uuid := barberflow_private.individual_professional(shop_id);
begin
  if person is null then return false; end if;
  perform 1 from public.barberflow_schedule s where s.establishment_id=shop_id and s.id=entry_id
    and s.professional_id=person and s.kind='appointment' and s.state in ('pending','scheduled') for update;
  if not found then return false; end if;
  if operation='cancel' then return public.barberflow_cancel_appointment(shop_id,entry_id,reason); end if;
  if operation='absence' then return public.barberflow_set_schedule_state(shop_id,entry_id,'no_show'); end if;
  return false;
end;
$$;

create function public.barberflow_professional_panel(shop_id uuid, period text)
returns jsonb language sql stable security definer set search_path='' as $$
  with identity as (
    select p.*,e.name as business,e.profile_details->>'cover' as cover,(now() at time zone 'America/Sao_Paulo')::date as today
    from public.barberflow_professionals p join public.barberflow_establishments e on e.id=p.establishment_id
    where p.establishment_id=shop_id and p.id=barberflow_private.individual_professional(shop_id)
      and period in ('dia','semana','quinzena','mes')
  ), bounds as (
    select i.*,case period when 'semana' then date_trunc('week',today)::date
      when 'quinzena' then date_trunc('month',today)::date+case when extract(day from today)>15 then 15 else 0 end
      when 'mes' then date_trunc('month',today)::date else today end as first
    from identity i
  ), appointments as (
    select s.* from public.barberflow_schedule s join bounds i on i.id=s.professional_id and i.establishment_id=s.establishment_id
    where s.kind='appointment' and s.starts_at>=i.first and s.starts_at<i.today+1
  ), paid as (
    select r.*, a.starts_at
    from appointments a join public.barberflow_receipts r on r.appointment_id=a.id and r.establishment_id=shop_id
    where a.state='completed' and r.total_cents <= coalesce((select sum(m.amount_cents)
      from barberflow_private.receipt_payments m where m.appointment_id=a.id and m.reversed_at is null),0)
  )
  select jsonb_build_object('name',i.name,'business',i.business,'photo',i.photo_url,'cover',i.cover,
    'service_rate',i.commission_bps,'product_rate',i.product_commission_bps,'today',i.today,
    'available',coalesce((select d.available from barberflow_private.professional_day d
      where d.shop=shop_id and d.professional=i.id and d.day=i.today),true),
    'services',coalesce((select jsonb_agg(s.name order by s.name) from public.barberflow_professional_services ps
      join public.barberflow_services s on s.establishment_id=ps.establishment_id and s.id=ps.service_id
      where ps.establishment_id=shop_id and ps.professional_id=i.id and s.active),'[]'),
    'appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'client',a.client_name,'phone',a.client_phone,
      'service',a.service_name,'starts',a.starts_at,'state',a.state) order by a.starts_at,a.id)
      from appointments a where a.starts_at>=i.today),'[]'),
    'attended',(select count(*) from appointments where state='completed'),
    'absent',(select count(*) from appointments where state='no_show'),
    'hours',coalesce((select jsonb_agg(to_jsonb(h) order by h.weekday,h.hour) from (
      select extract(isodow from starts_at)::int as weekday,extract(hour from starts_at)::int as hour,count(*) as quantity
      from appointments where state='completed' group by 1,2) h),'[]'),
    'paid_services',(select count(*) from paid)+(select count(*) from paid p join public.barberflow_order_services l on l.appointment_id=p.appointment_id and l.establishment_id=shop_id),
    'sold_products',coalesce((select sum(l.quantity) from paid p join public.barberflow_order_products l on l.appointment_id=p.appointment_id and l.establishment_id=shop_id),0),
    'daily', (select jsonb_build_object('services',coalesce(sum(p.service_cents),0),'products',coalesce(sum(p.products_cents),0),
      'service_commission',coalesce(sum(round(p.service_cents::numeric*p.commission_bps/10000)) filter(where not settled.paid),0),
      'product_commission',coalesce(sum(round(p.products_cents::numeric*p.product_commission_bps/10000)) filter(where not settled.paid),0),
      'service_units',count(*)+(select count(*) from paid q join public.barberflow_order_services l on l.appointment_id=q.appointment_id and l.establishment_id=shop_id where q.starts_at>=i.today),
      'product_units',coalesce((select sum(l.quantity) from paid q join public.barberflow_order_products l on l.appointment_id=q.appointment_id and l.establishment_id=shop_id where q.starts_at>=i.today),0))
      from paid p cross join lateral (select exists(select 1 from barberflow_private.commission_receipt_orders o
        where o.shop=shop_id and o.origin='agenda' and o.order_id=p.appointment_id) as paid) settled where p.starts_at>=i.today)
  ) from bounds i;
$$;

revoke all on function barberflow_private.individual_professional(uuid) from public,anon,authenticated;
revoke all on function public.barberflow_set_professional_day(uuid,boolean),
  public.barberflow_professional_appointment(uuid,uuid,text,text),public.barberflow_professional_panel(uuid,text) from public,anon;
grant execute on function public.barberflow_set_professional_day(uuid,boolean),
  public.barberflow_professional_appointment(uuid,uuid,text,text),public.barberflow_professional_panel(uuid,text) to authenticated;
create or replace function barberflow_private.available_slots(profile_slug text, professional uuid, service uuid, booking_day date,
  ignored uuid default null, length_override integer default null, preparation_override integer default null)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select candidate.start_at
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from booking_day)
  cross join lateral (select coalesce(length_override,s.duration_minutes) as duration,
    coalesce(preparation_override,e.preparation_minutes) as preparation) limits
  cross join lateral pg_catalog.generate_series(
    booking_day+h.starts_at, booking_day+h.ends_at-pg_catalog.make_interval(mins=>limits.duration),
    pg_catalog.make_interval(mins=>e.slot_step_minutes)
  ) candidate(start_at)
  where e.slug=profile_slug and e.published
    and (booking_day <> (now() at time zone 'America/Sao_Paulo')::date or not exists (
      select 1 from barberflow_private.professional_day d where d.shop=e.id and d.professional=available_slots.professional
        and d.day=booking_day and not d.available
    ))
    and booking_day between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+e.max_advance_days
    and candidate.start_at > (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(mins=>e.min_notice_minutes)
    and (h.break_start is null or candidate.start_at::time >= h.break_end
      or (candidate.start_at+pg_catalog.make_interval(mins=>limits.duration))::time <= h.break_start)
    and not exists (
      select 1 from public.barberflow_schedule a where a.professional_id=professional and a.establishment_id=e.id
        and a.id is distinct from ignored and a.state in ('pending','scheduled','completed','no_show')
        and tsrange(a.starts_at,a.ends_at+pg_catalog.make_interval(mins=>a.preparation_minutes),'[)')
          && tsrange(candidate.start_at,candidate.start_at+pg_catalog.make_interval(mins=>limits.duration+limits.preparation),'[)')
    )
  order by candidate.start_at;
$$;

create function public.barberflow_professional_closed_today(shop_id uuid)
returns table(professional_id uuid)
language sql stable security definer set search_path='' as $$
  select d.professional from barberflow_private.professional_day d
  where d.shop=shop_id and d.day=(now() at time zone 'America/Sao_Paulo')::date and not d.available
    and exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid());
$$;
revoke all on function public.barberflow_professional_closed_today(uuid) from public,anon;
grant execute on function public.barberflow_professional_closed_today(uuid) to authenticated;

create function barberflow_private.protect_own_commission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.commission_bps,new.product_commission_bps) is distinct from (old.commission_bps,old.product_commission_bps)
    and exists(select 1 from barberflow_private.team_access t where t.establishment_id=old.establishment_id
      and t.professional_id=old.id and t.user_id=auth.uid() and t.accepted_at is not null and t.revoked_at is null)
    and not exists(select 1 from public.barberflow_establishments e where e.id=old.establishment_id and e.owner_id=auth.uid())
  then raise exception 'A comissao deve ser definida pelo proprietario.' using errcode='42501'; end if;
  return new;
end;
$$;
create trigger protect_own_commission before update of commission_bps,product_commission_bps on public.barberflow_professionals
for each row execute function barberflow_private.protect_own_commission();

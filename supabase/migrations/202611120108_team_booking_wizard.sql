create function public.barberflow_team_booking_context(shop_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('slug',case when e.published then e.slug end,
    'limit_days',e.max_advance_days,'services',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'price_cents',s.price_cents,
        'duration_minutes',s.duration_minutes,'professionals',people.items) order by s.display_order,s.name,s.id)
      from public.barberflow_services s
      cross join lateral (
        select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'photo_url',p.photo_url) order by p.display_order,p.name,p.id) as items
        from public.barberflow_professional_services ps
        join public.barberflow_professionals p on p.establishment_id=ps.establishment_id and p.id=ps.professional_id
        where ps.establishment_id=e.id and ps.service_id=s.id and p.active and barberflow_private.team_can_manage(e.id,p.id)
      ) people where s.establishment_id=e.id and s.active and s.deleted_at is null and people.items is not null
    ),'[]'))
  from public.barberflow_establishments e where e.id=shop_id
    and exists(select 1 from public.barberflow_my_team_shops() t where t.id=e.id);
$$;
revoke all on function public.barberflow_team_booking_context(uuid) from public,anon;
grant execute on function public.barberflow_team_booking_context(uuid) to authenticated;
create function public.barberflow_team_booking_slots(shop_id uuid, professional uuid, service uuid, booking_day date)
returns table(slot timestamp)
language sql stable security definer set search_path='' as $$
  select candidate.start_at
  from public.barberflow_establishments e
  join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=professional and ps.service_id=service
  join public.barberflow_professionals p on p.establishment_id=e.id and p.id=professional and p.active
  join public.barberflow_services s on s.establishment_id=e.id and s.id=service and s.active
  join barberflow_private.effective_professional_hours h on h.establishment_id=e.id and h.professional_id=professional and h.weekday=extract(dow from booking_day)
  cross join lateral (select s.duration_minutes as duration,
    e.preparation_minutes as preparation) limits
  cross join lateral pg_catalog.generate_series(
    booking_day+h.starts_at, booking_day+h.ends_at-pg_catalog.make_interval(mins=>limits.duration),
    pg_catalog.make_interval(mins=>e.slot_step_minutes)
  ) candidate(start_at)
  where e.id=shop_id and barberflow_private.team_can_manage(e.id,professional)
    and (booking_day <> (now() at time zone 'America/Sao_Paulo')::date or not exists (
      select 1 from barberflow_private.professional_day d where d.shop=e.id and d.professional=barberflow_team_booking_slots.professional
        and d.day=booking_day and not d.available
    ))
    and booking_day between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+e.max_advance_days
    and candidate.start_at > (now() at time zone 'America/Sao_Paulo')+pg_catalog.make_interval(mins=>e.min_notice_minutes)
    and (h.break_start is null or candidate.start_at::time >= h.break_end
      or (candidate.start_at+pg_catalog.make_interval(mins=>limits.duration))::time <= h.break_start)
    and not exists (
      select 1 from public.barberflow_schedule a where a.professional_id=professional and a.establishment_id=e.id
        and a.state in ('pending','scheduled','completed','no_show')
        and tsrange(a.starts_at,a.ends_at+pg_catalog.make_interval(mins=>a.preparation_minutes),'[)')
          && tsrange(candidate.start_at,candidate.start_at+pg_catalog.make_interval(mins=>limits.duration+limits.preparation),'[)')
    )
  order by candidate.start_at;
$$;
revoke all on function public.barberflow_team_booking_slots(uuid,uuid,uuid,date) from public,anon;
grant execute on function public.barberflow_team_booking_slots(uuid,uuid,uuid,date) to authenticated;
create or replace function public.barberflow_professional_agenda_period(shop_id uuid, agenda_period text)
returns jsonb language sql stable security definer set search_path='' as $$
  with context as (
    select barberflow_private.individual_professional(shop_id) as person,
      (now() at time zone 'America/Sao_Paulo')::date as today
    where agenda_period in ('dia','semana','quinzena','mes')
  ), bounds as (
    select person, case agenda_period
      when 'semana' then date_trunc('week',today)::date
      when 'quinzena' then date_trunc('month',today)::date + case when extract(day from today)>15 then 15 else 0 end
      when 'mes' then date_trunc('month',today)::date else today end as first,
      case agenda_period
      when 'semana' then date_trunc('week',today)::date+7
      when 'quinzena' then case when extract(day from today)<=15 then date_trunc('month',today)::date+15 else (date_trunc('month',today)+interval '1 month')::date end
      when 'mes' then (date_trunc('month',today)+interval '1 month')::date else today+1 end as ending
    from context where person is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'booked_by',a.booked_by,'client',a.client_name,'phone',a.client_phone,
    'service',a.service_name,'starts',a.starts_at,'state',a.state,'checked_in',a.professional_checked_in_at is not null)
    order by a.starts_at,a.id) filter(where a.id is not null),'[]'::jsonb)
  from bounds b left join public.barberflow_schedule a on a.establishment_id=shop_id
    and a.professional_id=b.person and a.kind='appointment' and a.starts_at>=b.first and a.starts_at<b.ending
  group by b.person;
$$;


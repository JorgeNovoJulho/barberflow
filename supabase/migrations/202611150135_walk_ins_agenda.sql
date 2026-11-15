create or replace function public.barberflow_professional_agenda_with_walk_ins(shop_id uuid, agenda_period text)
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
  ), entries as (
    select a.starts_at as starts, a.id,
      jsonb_build_object('id',a.id,'booked_by',a.booked_by,'client',a.client_name,'phone',a.client_phone,
        'service',a.service_name,'price_cents',a.price_cents,'cancellation_reason',case when a.state='cancelled' then a.cancellation_reason end,
        'starts',a.starts_at,'state',a.state,'checked_in',a.professional_checked_in_at is not null) as item
    from bounds b join public.barberflow_schedule a on a.establishment_id=shop_id
      and a.professional_id=b.person and a.kind='appointment' and a.starts_at>=b.first and a.starts_at<b.ending
    union all
    select s.created_at at time zone 'America/Sao_Paulo', s.id,
      jsonb_build_object('id',s.id,'client',s.client_name,'phone',s.phone,'service','Avulso',
        'price_cents',s.service_cents+s.product_cents,'cancellation_reason',s.cancellation_reason,
        'starts',s.created_at at time zone 'America/Sao_Paulo','state',s.state,'walk_in',true)
    from bounds b join barberflow_private.counter_sales s on s.shop=shop_id and s.walk_in_professional=b.person
      and s.created_at>=b.first::timestamp at time zone 'America/Sao_Paulo'
      and s.created_at<b.ending::timestamp at time zone 'America/Sao_Paulo'
  )
  select coalesce(jsonb_agg(e.item order by e.starts,e.id),'[]'::jsonb)
  from bounds b left join entries e on true
  where e.id is not null;
$$;
revoke all on function public.barberflow_professional_agenda_with_walk_ins(uuid,text) from public,anon;
grant execute on function public.barberflow_professional_agenda_with_walk_ins(uuid,text) to authenticated;

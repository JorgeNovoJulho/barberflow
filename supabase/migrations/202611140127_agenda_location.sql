create or replace function public.barberflow_team_booking_context(shop_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('slug',case when e.published then e.slug end,
    'city',e.city,'region',e.profile_details->>'region','limit_days',e.max_advance_days,'services',coalesce((
      select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description,'price_cents',s.price_cents,
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

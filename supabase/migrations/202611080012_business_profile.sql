alter table public.barberflow_establishments add column profile_details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(profile_details)='object' and octet_length(profile_details::text)<=12000);
grant update (profile_details) on public.barberflow_establishments to authenticated;

alter table public.barberflow_professionals
  add column photo_url text not null default '' check (char_length(photo_url)<=500),
  add column commission_bps integer not null default 0 check (commission_bps between 0 and 10000);
grant insert(photo_url,commission_bps), update(photo_url,commission_bps) on public.barberflow_professionals to authenticated;

alter table public.barberflow_services add column display_order integer not null default 0
  check (display_order between 0 and 9999);
grant insert(display_order), update(display_order) on public.barberflow_services to authenticated;

alter function public.barberflow_public_profile(text) set schema barberflow_private;
revoke all on function barberflow_private.barberflow_public_profile(text) from public,anon,authenticated;

create function public.barberflow_public_profile(profile_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select payload.profile || jsonb_build_object('details',e.profile_details,'services',coalesce((
    select jsonb_agg(item.value || jsonb_build_object('professionals',coalesce((
      select jsonb_agg(person.value || jsonb_build_object('photo_url',p.photo_url) order by p.name,p.id)
      from jsonb_array_elements(item.value->'professionals') person
      join public.barberflow_professionals p on p.establishment_id=e.id and p.id=(person.value->>'id')::uuid
    ),'[]'::jsonb)) order by s.display_order,s.name,s.id)
    from jsonb_array_elements(payload.profile->'services') item
    join public.barberflow_services s on s.establishment_id=e.id and s.id=(item.value->>'id')::uuid
  ),'[]'::jsonb))
  from public.barberflow_establishments e
  cross join lateral (select barberflow_private.barberflow_public_profile(profile_slug) as profile) payload
  where e.slug=profile_slug and e.published;
$$;
revoke all on function public.barberflow_public_profile(text) from public;
grant execute on function public.barberflow_public_profile(text) to anon,authenticated;

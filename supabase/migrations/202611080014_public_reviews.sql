create table public.barberflow_reviews (
  appointment_id uuid primary key references public.barberflow_schedule(id),
  establishment_id uuid not null references public.barberflow_establishments(id),
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment)<=500),
  author text not null,
  created_at timestamptz not null default now()
);
create index barberflow_reviews_shop_created on public.barberflow_reviews(establishment_id,created_at desc);
alter table public.barberflow_reviews enable row level security;
revoke all on public.barberflow_reviews from public,anon,authenticated;

create function public.barberflow_submit_review(entry uuid, stars smallint, message text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  insert into public.barberflow_reviews(appointment_id,establishment_id,rating,comment,author)
    select a.id,a.establishment_id,stars,btrim(coalesce(message,'')),
      left(split_part(btrim(a.client_name),' ',1),60)
    from public.barberflow_schedule a
    where a.id=entry and a.booked_by=(select auth.uid()) and a.state='completed'
    on conflict (appointment_id) do nothing;
  return found;
end;
$$;
revoke all on function public.barberflow_submit_review(uuid,smallint,text) from public,anon;
grant execute on function public.barberflow_submit_review(uuid,smallint,text) to authenticated;

create function public.barberflow_public_reviews(profile_slug text)
returns table(rating smallint,comment text,author text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select r.rating,r.comment,r.author,r.created_at from public.barberflow_reviews r
  join public.barberflow_establishments e on e.id=r.establishment_id
  where e.slug=profile_slug and e.published order by r.created_at desc limit 20;
$$;

create function public.barberflow_profile_next_slots(profile_slug text)
returns table(professional_id uuid,slot timestamp)
language sql stable security definer set search_path='' as $$
  select p.id,next_slot.slot from public.barberflow_establishments e
  join public.barberflow_professionals p on p.establishment_id=e.id and p.active
  cross join lateral (
    select candidates.slot from pg_catalog.generate_series(0,least(30,e.max_advance_days)) days
    join public.barberflow_professional_hours h on h.establishment_id=e.id and h.professional_id=p.id
      and h.weekday=extract(dow from (now() at time zone 'America/Sao_Paulo')::date+days)
    join public.barberflow_professional_services ps on ps.establishment_id=e.id and ps.professional_id=p.id
    cross join lateral public.barberflow_public_slots(profile_slug,p.id,ps.service_id,
      (now() at time zone 'America/Sao_Paulo')::date+days) candidates
    order by candidates.slot limit 1
  ) next_slot
  where e.slug=profile_slug and e.published;
$$;
revoke all on function public.barberflow_public_reviews(text),public.barberflow_profile_next_slots(text) from public;
grant execute on function public.barberflow_public_reviews(text),public.barberflow_profile_next_slots(text) to anon,authenticated;

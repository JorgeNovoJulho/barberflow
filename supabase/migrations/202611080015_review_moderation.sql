alter table public.barberflow_reviews
  add column public_id uuid not null default gen_random_uuid() unique,
  add column hidden boolean not null default false;

create table public.barberflow_review_reports (
  review_id uuid not null references public.barberflow_reviews(public_id),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key(review_id,reporter_id)
);
create table public.barberflow_review_decisions (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.barberflow_reviews(public_id),
  moderator_id uuid references auth.users(id) on delete set null,
  decision text not null check (decision in ('hide','restore','dismiss')),
  created_at timestamptz not null default now()
);
alter table public.barberflow_review_reports enable row level security;
alter table public.barberflow_review_decisions enable row level security;
revoke all on public.barberflow_review_reports,public.barberflow_review_decisions from public,anon,authenticated;

drop function public.barberflow_public_reviews(text);
create function public.barberflow_public_reviews(profile_slug text)
returns table(id uuid,rating smallint,comment text,author text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select r.public_id,r.rating,r.comment,r.author,r.created_at from public.barberflow_reviews r
  join public.barberflow_establishments e on e.id=r.establishment_id
  where e.slug=profile_slug and e.published and not r.hidden order by r.created_at desc limit 20;
$$;

create function public.barberflow_report_review(review uuid, profile_slug text, report_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare reporter uuid := (select auth.uid());
begin
  if reporter is null or not exists(select 1 from auth.users where id=reporter and email_confirmed_at is not null)
    or report_reason is null or char_length(btrim(report_reason)) not between 1 and 500 then return false; end if;
  perform 1 from public.barberflow_reviews r
    join public.barberflow_establishments e on e.id=r.establishment_id
    join public.barberflow_schedule a on a.id=r.appointment_id
    where r.public_id=review and not r.hidden and e.published and e.slug=profile_slug
      and a.booked_by is distinct from reporter for share of r;
  if not found then return false; end if;
  insert into public.barberflow_review_reports(review_id,reporter_id,reason)
    values(review,reporter,btrim(report_reason)) on conflict do nothing;
  return found;
end;
$$;

create function public.barberflow_review_queue()
returns table(id uuid,shop text,slug text,rating smallint,comment text,author text,hidden boolean,
  pending_count bigint,reasons text[],last_decision text)
language sql stable security definer set search_path='' as $$
  select r.public_id,e.name,e.slug,r.rating,r.comment,r.author,r.hidden,
    (select count(*) from public.barberflow_review_reports q where q.review_id=r.public_id and q.resolved_at is null),
    array(select q.reason from public.barberflow_review_reports q where q.review_id=r.public_id order by q.resolved_at nulls first,q.created_at desc limit 10),
    (select d.decision from public.barberflow_review_decisions d where d.review_id=r.public_id order by d.id desc limit 1)
  from public.barberflow_reviews r join public.barberflow_establishments e on e.id=r.establishment_id
  where public.barberflow_is_master() and exists(select 1 from public.barberflow_review_reports q where q.review_id=r.public_id)
  order by exists(select 1 from public.barberflow_review_reports q where q.review_id=r.public_id and q.resolved_at is null) desc,
    r.created_at desc limit 100;
$$;

create function public.barberflow_moderate_review(review uuid, decision text)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_hidden boolean;
begin
  if not public.barberflow_is_master() or decision is null or decision not in ('hide','restore','dismiss') then return false; end if;
  select hidden into current_hidden from public.barberflow_reviews where public_id=review for update;
  if not found or (decision='hide' and current_hidden) or (decision='restore' and not current_hidden) then return false; end if;
  if decision<>'restore' and not exists(select 1 from public.barberflow_review_reports where review_id=review and resolved_at is null)
    then return false; end if;
  if decision<>'dismiss' then update public.barberflow_reviews set hidden=(decision='hide') where public_id=review; end if;
  update public.barberflow_review_reports set resolved_at=now() where review_id=review and resolved_at is null;
  insert into public.barberflow_review_decisions(review_id,moderator_id,decision) values(review,(select auth.uid()),decision);
  return true;
end;
$$;

revoke all on function public.barberflow_public_reviews(text) from public;
grant execute on function public.barberflow_public_reviews(text) to anon,authenticated;
revoke all on function public.barberflow_report_review(uuid,text,text),public.barberflow_review_queue(),
  public.barberflow_moderate_review(uuid,text) from public,anon;
grant execute on function public.barberflow_report_review(uuid,text,text),public.barberflow_review_queue(),
  public.barberflow_moderate_review(uuid,text) to authenticated;

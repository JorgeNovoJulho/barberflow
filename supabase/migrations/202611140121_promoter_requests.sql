create table barberflow_private.promoter_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  reason text
);
alter table barberflow_private.promoter_requests enable row level security;
revoke all on barberflow_private.promoter_requests from public, anon, authenticated;

create function public.barberflow_promoter_request(send_request boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  applicant uuid := auth.uid();
  eligible boolean;
  request barberflow_private.promoter_requests;
begin
  if applicant is null then return null; end if;
  if exists (select 1 from barberflow_private.promoters where user_id=applicant and deleted_at is null) then
    return jsonb_build_object('status','active');
  end if;
  eligible := exists (
    select 1 from public.barberflow_subscription_payments p
    join public.barberflow_establishments e on e.id=p.establishment_id
    where e.owner_id=applicant and p.plan in ('pro','premium')
  );
  if send_request and eligible then
    insert into barberflow_private.promoter_requests as r(user_id) values(applicant)
    on conflict (user_id) do update set status='pending', requested_at=now(), reason=null
      where r.status='denied';
  end if;
  select * into request from barberflow_private.promoter_requests where user_id=applicant;
  return jsonb_build_object('eligible',eligible,'status',request.status,'reason',request.reason);
end;
$$;

create function public.barberflow_pending_promoter_requests()
returns table(id uuid,email text,requested_at timestamptz,payments bigint)
language sql stable security definer set search_path='' as $$
  select u.id,u.email,r.requested_at,
    (select count(*) from public.barberflow_subscription_payments p
     join public.barberflow_establishments e on e.id=p.establishment_id where e.owner_id=u.id)
  from barberflow_private.promoter_requests r join auth.users u on u.id=r.user_id
  where public.barberflow_is_master() and r.status='pending'
  order by r.requested_at;
$$;

create function public.barberflow_review_promoter_request(applicant uuid, approve boolean, explanation text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if public.barberflow_is_master() is distinct from true or approve is null or length(explanation)>500 then return false; end if;
  update barberflow_private.promoter_requests
  set status=case when approve then 'approved' else 'denied' end, reason=nullif(btrim(explanation),'')
  where user_id=applicant and status='pending';
  if not found then return false; end if;
  if approve then
    insert into barberflow_private.promoters(user_id,referral_code,first_access_at)
    values(applicant,upper(encode(extensions.gen_random_bytes(6),'hex')),now())
    on conflict (user_id) do update set deleted_at=null, blocked_at=null,
      referral_code=coalesce(promoters.referral_code,excluded.referral_code);
  end if;
  return true;
end;
$$;

revoke all on function public.barberflow_promoter_request(boolean),
  public.barberflow_pending_promoter_requests(), public.barberflow_review_promoter_request(uuid,boolean,text) from public, anon;
grant execute on function public.barberflow_promoter_request(boolean),
  public.barberflow_pending_promoter_requests(), public.barberflow_review_promoter_request(uuid,boolean,text) to authenticated;

create function public.barberflow_social_card_counts(profiles uuid[], shops uuid[])
returns table(id uuid, is_shop boolean, followers bigint)
language sql stable security invoker set search_path='' as $$
  select requested.id, requested.is_shop, (counts.data->>'followers')::bigint
  from (
    (select distinct p.id,false as is_shop from unnest(profiles) p(id) limit 12)
    union all
    (select distinct s.id,true from unnest(shops) s(id) limit 12)
  ) requested
  cross join lateral (select public.barberflow_social_counts(
    case when not requested.is_shop then requested.id end,
    case when requested.is_shop then requested.id end
  ) as data) counts
  where counts.data is not null;
$$;
revoke all on function public.barberflow_social_card_counts(uuid[],uuid[]) from public,anon;
grant execute on function public.barberflow_social_card_counts(uuid[],uuid[]) to authenticated;

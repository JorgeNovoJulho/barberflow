alter table public.barberflow_clients
  add column email text not null default '' check(char_length(email)<=254),
  add column instagram text not null default '' check(char_length(instagram)<=500),
  add column facebook text not null default '' check(char_length(facebook)<=500),
  add column youtube text not null default '' check(char_length(youtube)<=500),
  add column tiktok text not null default '' check(char_length(tiktok)<=500),
  add column photo_path text not null default '' check(char_length(photo_path)<=100);
grant insert(email,instagram,facebook,youtube,tiktok,photo_path),
  update(email,instagram,facebook,youtube,tiktok,photo_path) on public.barberflow_clients to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('barberflow-client-photos','barberflow-client-photos',false,5242880,
  array['image/jpeg','image/png','image/webp','image/avif']);

create function public.barberflow_manage_client_photo(object_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_establishments e
    where e.id::text=split_part(object_path,'/',1)
      and object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
      and (e.owner_id=(select auth.uid()) or public.barberflow_team_can_edit_clients(e.id)));
$$;
revoke all on function public.barberflow_manage_client_photo(text) from public,anon;
grant execute on function public.barberflow_manage_client_photo(text) to authenticated;
create policy "Authorized staff manage client photos" on storage.objects for all to authenticated
  using(bucket_id='barberflow-client-photos' and public.barberflow_manage_client_photo(name))
  with check(bucket_id='barberflow-client-photos' and public.barberflow_manage_client_photo(name));

alter table public.barberflow_products alter column showcase set default true;

create policy "Public showcase videos" on storage.objects for select to anon,authenticated
  using(bucket_id='barberflow-product-videos' and split_part(name,'/',3)='video'
    and cardinality(string_to_array(name,'/'))=3
    and public.barberflow_showcase_photo(split_part(name,'/',1)||'/'||split_part(name,'/',2)||'/foto-1'));

drop function public.barberflow_client_directory(uuid,text,integer,text);
create function public.barberflow_client_directory(shop uuid, search_text text, return_days integer, sort_by text)
returns table(id uuid,name text,phone text,preferences text,notes text,active boolean,
  email text,instagram text,facebook text,youtube text,tiktok text,photo_path text,
  last_visit date,visits bigint,billed_cents numeric)
language sql stable security invoker set search_path='' as $$
  select c.id,c.name,c.phone,c.preferences,c.notes,c.active,c.email,c.instagram,c.facebook,c.youtube,c.tiktok,c.photo_path,
    stats.last_visit,stats.visits,stats.billed_cents
  from public.barberflow_clients c
  cross join lateral (
    select max(a.starts_at)::date as last_visit,count(*) as visits,coalesce(sum(r.total_cents),0) as billed_cents
    from public.barberflow_schedule a
    left join public.barberflow_receipts r on r.appointment_id=a.id and r.establishment_id=shop
    where a.establishment_id=shop and a.client_id=c.id and a.kind='appointment' and a.state='completed'
  ) stats
  where c.establishment_id=shop
    and char_length(search_text)<=120
    and (search_text='' or strpos(lower(c.name),lower(search_text))>0)
    and (return_days=0 or (return_days in (15,20,30,45,60,90) and c.active
      and stats.last_visit<=(now() at time zone 'America/Sao_Paulo')::date-return_days))
  order by case when sort_by='spend' then stats.billed_cents end desc nulls last,
    case when sort_by='recent' then c.created_at end desc nulls last,
    case when sort_by='visit' then stats.last_visit end desc nulls last,c.name,c.id
  limit 100;
$$;

revoke all on function public.barberflow_client_directory(uuid,text,integer,text) from public,anon;
grant execute on function public.barberflow_client_directory(uuid,text,integer,text) to authenticated;

drop function public.barberflow_showcase_products(text,uuid);
create function public.barberflow_showcase_products(profile_slug text, preview_shop uuid default null, page_number integer default 1)
returns table(id uuid,shop_id uuid,name text,description text,sku text,price_cents integer,available integer,
  bundle_units integer,bundle_cents integer,pix_enabled boolean,total_count bigint)
language sql stable security definer set search_path='' as $$
  select p.id,e.id,p.name,p.description,p.sku,p.price_cents,(p.stock-held.units)::integer,
    case when p.promo_until>=today.day and p.promo_cents<p.price_cents::bigint*p.promo_units then p.promo_units end,
    case when p.promo_until>=today.day and p.promo_cents<p.price_cents::bigint*p.promo_units then p.promo_cents end,
    pix.establishment_id is not null,count(*) over()
  from public.barberflow_establishments e
  join public.barberflow_products p on p.establishment_id=e.id
  left join public.barberflow_showcase_pix pix on pix.establishment_id=e.id
  cross join lateral (select barberflow_private.showcase_held(p.id) as units) held
  cross join (select (now() at time zone 'America/Sao_Paulo')::date as day) today
  where ((preview_shop is null and e.slug=profile_slug and e.published)
    or (preview_shop=e.id and e.owner_id=(select auth.uid())))
    and p.showcase and p.active and p.deleted_at is null and p.stock>held.units and p.price_cents>0
    and (p.expires_on is null or p.expires_on>=today.day)
  order by p.name,p.id limit 30 offset (greatest(1,least(page_number,100000))-1)*30;
$$;
revoke all on function public.barberflow_showcase_products(text,uuid,integer) from public;
grant execute on function public.barberflow_showcase_products(text,uuid,integer) to anon,authenticated;

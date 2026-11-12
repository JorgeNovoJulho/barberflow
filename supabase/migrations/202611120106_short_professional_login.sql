alter table barberflow_private.managed_professionals add column public_login text unique;

create function barberflow_private.assign_professional_login() returns trigger
language plpgsql security definer set search_path='' as $$
declare person_name text; shop_name text; person_key text; shop_key text; candidate text; suffix integer := 1;
begin
  select p.name,e.name into strict person_name,shop_name from public.barberflow_professionals p
  join public.barberflow_establishments e on e.id=p.establishment_id
  where p.id=new.professional and e.id=new.shop;
  person_key := coalesce(nullif(left(regexp_replace(lower(normalize(person_name,NFD)), '[^a-z0-9]', '', 'g'),48),''),'profissional');
  shop_key := coalesce(nullif(left(regexp_replace(lower(normalize(shop_name,NFD)), '[^a-z0-9]', '', 'g'),40),''),'loja');
  perform pg_advisory_xact_lock(hashtextextended(shop_key,106));
  loop
    candidate := person_key || case when suffix=1 then '' else suffix::text end || '@' || shop_key || '.topbarberflow.com.br';
    exit when not exists(select 1 from barberflow_private.managed_professionals m where m.public_login=candidate);
    suffix := suffix+1;
  end loop;
  new.public_login := candidate;
  return new;
end;
$$;
create trigger assign_professional_login before insert or update of public_login on barberflow_private.managed_professionals
for each row when (new.public_login is null) execute function barberflow_private.assign_professional_login();
update barberflow_private.managed_professionals set public_login=null where public_login is null;
alter table barberflow_private.managed_professionals alter column public_login set not null;

create or replace function public.barberflow_managed_professional_roster(shop_id uuid)
returns table(professional_id uuid,login text,blocked boolean)
language sql stable security definer set search_path='' as $$
  select m.professional,m.public_login,t.revoked_at is not null from barberflow_private.managed_professionals m
  join barberflow_private.team_access t on t.establishment_id=m.shop and t.professional_id=m.professional and t.user_id=m.user_id
  where m.shop=shop_id and exists(select 1 from public.barberflow_establishments e where e.id=shop_id and e.owner_id=auth.uid());
$$;

create function public.barberflow_resolve_professional_login(address text) returns text
language sql stable security definer set search_path='' as $$
  select u.email from barberflow_private.managed_professionals m join auth.users u on u.id=m.user_id
  where m.public_login=lower(btrim(address));
$$;
revoke all on function public.barberflow_resolve_professional_login(text) from public,anon,authenticated;
grant execute on function public.barberflow_resolve_professional_login(text) to service_role;
notify pgrst,'reload schema';

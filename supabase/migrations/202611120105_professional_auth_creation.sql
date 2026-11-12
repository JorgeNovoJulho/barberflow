create or replace function barberflow_private.reserve_managed_professional_email() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists(select 1 from auth.users u where u.id=new.id
    and lower(u.email) like '%@equipe.topbarberflow.com.br'
    and u.raw_app_meta_data->>'barberflow_managed_professional' is distinct from 'true')
  then raise exception 'Email reserved for managed credentials.' using errcode='42501'; end if;
  return null;
end;
$$;
drop trigger barberflow_reserve_managed_professional_email on auth.users;
create constraint trigger barberflow_reserve_managed_professional_email
after insert or update of email on auth.users deferrable initially deferred
for each row execute function barberflow_private.reserve_managed_professional_email();

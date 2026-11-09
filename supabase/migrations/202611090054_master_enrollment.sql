-- Bind the sole master account after Supabase confirms its email.
create function barberflow_private.enroll_master_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if lower(new.email)='jorgericardosalgado@gmail.com' and new.email_confirmed_at is not null then
    insert into barberflow_private.master_account(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function barberflow_private.enroll_master_account() from public,anon,authenticated;

create trigger barberflow_enroll_confirmed_master
  after insert or update of email_confirmed_at on auth.users
  for each row execute function barberflow_private.enroll_master_account();

insert into barberflow_private.master_account(user_id)
select id from auth.users where lower(email)='jorgericardosalgado@gmail.com' and email_confirmed_at is not null
order by created_at limit 1 on conflict do nothing;

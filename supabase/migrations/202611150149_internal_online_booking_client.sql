create function barberflow_private.link_online_booking_client()
returns trigger language plpgsql security definer set search_path='' as $$
declare contact text := barberflow_private.client_contact_digits(new.client_phone);
begin
  if contact is null then return new; end if;
  select (array_agg(c.id))[1] into new.client_id
  from public.barberflow_clients c where c.establishment_id=new.establishment_id
    and barberflow_private.client_contact_digits(c.phone)=contact
  having count(*)=1;
  return new;
end;
$$;
revoke all on function barberflow_private.link_online_booking_client() from public,anon,authenticated;
create trigger link_online_booking_client before insert on public.barberflow_schedule
for each row when (new.kind='appointment' and new.client_id is null and (new.guest_online or new.booked_by is not null))
execute function barberflow_private.link_online_booking_client();

create function public.barberflow_internal_booking_clients(shop uuid, appointments uuid[])
returns table(appointment_id uuid,name text,client_number bigint,photo_path text)
language sql stable security definer set search_path='' as $$
  select a.id,c.name,c.client_number,c.photo_path
  from public.barberflow_schedule a join public.barberflow_clients c
    on c.establishment_id=a.establishment_id and c.id=a.client_id
  where a.establishment_id=shop and a.id=any(appointments) and
    (a.professional_id=barberflow_private.individual_professional(shop)
     or exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()));
$$;
revoke all on function public.barberflow_internal_booking_clients(uuid,uuid[]) from public,anon;
grant execute on function public.barberflow_internal_booking_clients(uuid,uuid[]) to authenticated;

create function public.barberflow_can_read_booking_client_photo(object_name text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.barberflow_clients c
    join public.barberflow_schedule a on a.establishment_id=c.establishment_id and a.client_id=c.id
    where c.photo_path=object_name and a.professional_id=barberflow_private.individual_professional(a.establishment_id));
$$;
revoke all on function public.barberflow_can_read_booking_client_photo(text) from public,anon;
grant execute on function public.barberflow_can_read_booking_client_photo(text) to authenticated;
create policy "Professional reads booked client photo" on storage.objects for select to authenticated
  using (bucket_id='barberflow-client-photos' and public.barberflow_can_read_booking_client_photo(name));

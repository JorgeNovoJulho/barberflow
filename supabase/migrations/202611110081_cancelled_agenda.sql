alter table public.barberflow_schedule add column cancelled_card_archived_at timestamptz;

create function public.barberflow_archive_cancelled_appointments(shop uuid, cutoff timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid())
    or cutoff is null then return false;
  end if;
  update public.barberflow_schedule a set cancelled_card_archived_at=now()
  where a.establishment_id=shop and a.kind='appointment' and a.state='cancelled'
    and a.cancelled_card_archived_at is null
    and (a.customer_cancelled_at is null or a.customer_cancelled_at<=least(cutoff,now()));
  return true;
end;
$$;
revoke all on function public.barberflow_archive_cancelled_appointments(uuid,timestamptz) from public,anon;
grant execute on function public.barberflow_archive_cancelled_appointments(uuid,timestamptz) to authenticated;

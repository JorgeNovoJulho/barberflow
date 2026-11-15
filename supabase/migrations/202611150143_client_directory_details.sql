alter table public.barberflow_clients add column client_number bigint;
with numbered as (
  select id,row_number() over(partition by establishment_id order by created_at nulls first,id) as client_number
  from public.barberflow_clients
)
update public.barberflow_clients c set client_number=n.client_number from numbered n where n.id=c.id;
alter table public.barberflow_clients alter column client_number set not null,
  add constraint barberflow_shop_client_number unique(establishment_id,client_number);

create table barberflow_private.client_numbers (
  shop uuid primary key references public.barberflow_establishments(id) on delete cascade,
  last_number bigint not null
);
revoke all on barberflow_private.client_numbers from public,anon,authenticated;
insert into barberflow_private.client_numbers(shop,last_number)
select establishment_id,max(client_number) from public.barberflow_clients group by establishment_id;

create function barberflow_private.assign_client_number()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into barberflow_private.client_numbers as serial(shop,last_number) values(new.establishment_id,1)
  on conflict(shop) do update set last_number=serial.last_number+1
  returning last_number into new.client_number;
  return new;
end;
$$;
revoke all on function barberflow_private.assign_client_number() from public,anon,authenticated;
create trigger assign_client_number before insert on public.barberflow_clients
for each row execute function barberflow_private.assign_client_number();

create function public.barberflow_client_visit_details(shop uuid, client uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with allowed as (
    select c.id from public.barberflow_clients c where c.establishment_id=shop and c.id=client
      and (public.barberflow_team_can_edit_clients(shop)
        or exists(select 1 from public.barberflow_establishments e where e.id=shop and e.owner_id=auth.uid()))
  ), visits as (
    select a.* from public.barberflow_schedule a join allowed c on c.id=a.client_id
    where a.establishment_id=shop and a.kind='appointment' and a.state='completed'
  ), recent as (
    select * from visits order by starts_at desc,id limit 25
  ), monthly as (
    select extract(dow from starts_at)::integer as weekday,extract(hour from starts_at)::integer as hour,count(*) as visits
    from visits where starts_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo')
      and starts_at<date_trunc('month',now() at time zone 'America/Sao_Paulo')+interval '1 month'
    group by 1,2
  )
  select jsonb_build_object(
    'visits',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'starts',a.starts_at,'service',a.service_name,'professional',p.name,
      'additional_services',coalesce((select jsonb_agg(s.service_name order by s.service_name)
        from public.barberflow_order_services s where s.establishment_id=shop and s.appointment_id=a.id),'[]'),
      'products',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity) order by i.product_name)
        from public.barberflow_order_products i where i.establishment_id=shop and i.appointment_id=a.id),'[]'),
      'paid_cents',coalesce((select sum(m.amount_cents) from barberflow_private.receipt_payments m
        where m.appointment_id=r.appointment_id and m.reversed_at is null),0)
    ) order by a.starts_at desc,a.id)
    from recent a
    join public.barberflow_professionals p on p.establishment_id=shop and p.id=a.professional_id
    left join public.barberflow_receipts r on r.establishment_id=shop and r.appointment_id=a.id),'[]'),
    'frequency',coalesce((select jsonb_agg(to_jsonb(m) order by m.visits desc,m.weekday,m.hour) from monthly m),'[]')
  ) from allowed;
$$;
revoke all on function public.barberflow_client_visit_details(uuid,uuid) from public,anon;
grant execute on function public.barberflow_client_visit_details(uuid,uuid) to authenticated;

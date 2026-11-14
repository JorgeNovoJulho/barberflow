create table barberflow_private.stock_sku_counters (
  shop uuid primary key references public.barberflow_establishments(id) on delete cascade,
  last_number bigint not null check (last_number > 0)
);

revoke all on barberflow_private.stock_sku_counters from public, anon, authenticated;

create function barberflow_private.assign_stock_sku() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sequence_number bigint;
begin
  if tg_op = 'UPDATE' and old.sku <> '' then
    new.sku := old.sku;
    return new;
  end if;
  loop
    insert into barberflow_private.stock_sku_counters as counter (shop, last_number)
      values (new.establishment_id, 1)
      on conflict (shop) do update set last_number = counter.last_number + 1
      returning last_number into sequence_number;
    new.sku := 'SKU-' || lpad(sequence_number::text, greatest(5, length(sequence_number::text)), '0');
    exit when not exists (
      select 1 from public.barberflow_products p
      where p.establishment_id = new.establishment_id and lower(p.sku) = lower(new.sku)
    );
  end loop;
  return new;
end;
$$;

revoke all on function barberflow_private.assign_stock_sku() from public, anon, authenticated;

create trigger assign_stock_sku
before insert or update of sku on public.barberflow_products
for each row execute function barberflow_private.assign_stock_sku();

do $$
declare
  product_id uuid;
begin
  for product_id in select id from public.barberflow_products where sku = '' and deleted_at is null order by id
  loop
    update public.barberflow_products set sku = '' where id = product_id and sku = '';
  end loop;
end;
$$;

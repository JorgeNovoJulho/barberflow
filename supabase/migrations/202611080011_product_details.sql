alter table public.barberflow_products
  add column cost_cents integer check (cost_cents between 0 and 99999999),
  add column minimum_stock integer not null default 0 check (minimum_stock between 0 and 1000000),
  add column expires_on date;

grant insert(cost_cents,minimum_stock,expires_on), update(cost_cents,minimum_stock,expires_on)
  on public.barberflow_products to authenticated;

create function public.barberflow_create_product(shop uuid, product_name text, product_sku text, sale_price integer,
  unit_cost integer, stock_floor integer, expiry date, initial_units integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare product_id uuid;
begin
  if initial_units is null or initial_units not between 0 and 1000000 then
    raise exception using errcode='22023',message='Invalid initial stock';
  end if;
  insert into public.barberflow_products(establishment_id,name,sku,price_cents,cost_cents,minimum_stock,expires_on)
    values(shop,product_name,product_sku,sale_price,unit_cost,stock_floor,expiry) returning id into product_id;
  if initial_units > 0 then
    perform public.barberflow_adjust_stock(shop,product_id,initial_units,'Estoque inicial');
  end if;
  return product_id;
end;
$$;
revoke all on function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer) from public,anon;
grant execute on function public.barberflow_create_product(uuid,text,text,integer,integer,integer,date,integer) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('barberflow-product-photos','barberflow-product-photos',false,5242880,
  array['image/jpeg','image/png','image/webp','image/avif']),
  ('barberflow-product-videos','barberflow-product-videos',false,20971520,
  array['video/mp4','video/webm']);

create function public.barberflow_owns_product_media(object_name text)
returns boolean language sql stable security invoker set search_path='' as $$
  select cardinality(string_to_array(object_name,'/'))=3
    and split_part(object_name,'/',3) in ('foto-1','foto-2','foto-3','foto-4','foto-5','video')
    and exists(select 1 from public.barberflow_products p
      join public.barberflow_establishments e on e.id=p.establishment_id
      where e.owner_id=(select auth.uid()) and e.id::text=split_part(object_name,'/',1)
        and p.id::text=split_part(object_name,'/',2));
$$;
revoke all on function public.barberflow_owns_product_media(text) from public,anon;
grant execute on function public.barberflow_owns_product_media(text) to authenticated;

create policy "Owner manages product media" on storage.objects for all to authenticated
  using (case when bucket_id='barberflow-product-photos' and split_part(name,'/',3)<>'video'
      or bucket_id='barberflow-product-videos' and split_part(name,'/',3)='video'
    then public.barberflow_owns_product_media(name) else false end)
  with check (case when bucket_id='barberflow-product-photos' and split_part(name,'/',3)<>'video'
      or bucket_id='barberflow-product-videos' and split_part(name,'/',3)='video'
    then public.barberflow_owns_product_media(name) else false end);

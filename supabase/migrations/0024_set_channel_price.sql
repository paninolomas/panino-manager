-- 0024_set_channel_price.sql
-- Fase 3. channel_prices ya tenía el índice único parcial "una vigente por
-- producto+canal" (0007) pero no había forma de cambiarlo sin el mismo riesgo
-- de dos pasos sueltos que ya resolvimos para reserve_targets (0023) -- mismo
-- patrón acá.

create or replace function set_channel_price(p_product_id uuid, p_channel_id uuid, p_price numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_product_location uuid;
  v_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para modificar precios';
  end if;
  if p_price < 0 then
    raise exception 'El precio no puede ser negativo';
  end if;

  select location_id into v_product_location from products where id = p_product_id;
  if v_product_location is null or v_product_location <> current_profile_location() then
    raise exception 'Producto inválido para tu ubicación';
  end if;

  update channel_prices
    set valid_to = current_date
  where product_id = p_product_id and channel_id = p_channel_id and valid_to is null;

  insert into channel_prices (product_id, channel_id, price, valid_from)
  values (p_product_id, p_channel_id, p_price, current_date)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function set_channel_price(uuid, uuid, numeric) to authenticated;

-- channel_prices.select (0010) solo chequeaba has_permission('expenses', false),
-- sin filtrar por ubicación del producto -- mismo tipo de hueco que se cerró
-- en Fase 1.1 para otras tablas. Se corrige acá de una vez.
drop policy if exists "channel_prices select" on channel_prices;
create policy "channel_prices select" on channel_prices for select
  using (
    has_permission('expenses', false)
    and exists (select 1 from products p where p.id = channel_prices.product_id and p.location_id = current_profile_location())
  );

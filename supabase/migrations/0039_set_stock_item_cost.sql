-- 0039_set_stock_item_cost.sql
-- Fase 17: cerrar el hueco real de la Fase 8 (0031) -- la tabla
-- stock_item_costs existía y recipe-engine.ts ya sabía multiplicar
-- cantidad × costo unitario, pero no había ninguna forma de CARGAR ese
-- costo desde la app (solo por SQL directo). Esto agrega:
--
--   1. set_stock_item_cost() -- mismo patrón versionado que
--      set_channel_commission (0036): cierra el costo vigente e inserta
--      uno nuevo, conserva el historial.
--   2. products_using_stock_item() -- para que, al guardar un costo nuevo,
--      la capa de TypeScript (recipes.repo.ts) sepa qué productos recalcular
--      y les actualice products.current_cost en cascada -- así "lo único
--      que hay que cambiar es el costo del insumo" (decisión confirmada
--      con el usuario), sin tener que reabrir cada receta a mano.
--
-- El cálculo del costo de receta en sí sigue haciéndose en TypeScript puro
-- (calculateRecipeCost), esto solo da los datos crudos -- mismo principio
-- de siempre.

create or replace function set_stock_item_cost(p_stock_item_id uuid, p_unit_cost numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para modificar costos de insumos';
  end if;
  if p_unit_cost < 0 then
    raise exception 'El costo debe ser mayor o igual a 0';
  end if;
  if not exists (
    select 1 from stock_items
    where id = p_stock_item_id and location_id = current_profile_location()
  ) then
    raise exception 'Insumo inválido';
  end if;

  update stock_item_costs
    set valid_to = current_date
  where stock_item_id = p_stock_item_id and valid_to is null;

  insert into stock_item_costs (stock_item_id, unit_cost, valid_from, created_by)
  values (p_stock_item_id, p_unit_cost, current_date, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function set_stock_item_cost(uuid, numeric) to authenticated;

create or replace function products_using_stock_item(p_stock_item_id uuid)
returns table (product_id uuid, product_name text)
language sql
stable
security definer set search_path = public
as $$
  select distinct p.id, p.name
  from product_recipe_items pri
  join products p on p.id = pri.product_id
  where pri.stock_item_id = p_stock_item_id
    and p.location_id = current_profile_location()
    and p.active = true
    and has_permission('expenses', false);
$$;

comment on function products_using_stock_item(uuid) is
  'Qué productos usan este insumo en su receta -- recipes.repo.ts la usa después de set_stock_item_cost() para recalcular products.current_cost en cascada.';

grant execute on function products_using_stock_item(uuid) to authenticated;

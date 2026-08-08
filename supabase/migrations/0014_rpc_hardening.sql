-- 0014_rpc_hardening.sql
-- Fase 1.1 items 3, 4 y 6. Reemplaza (CREATE OR REPLACE) tres funciones de 0011.
-- No se edita 0011: esta migración es la que queda vigente para estos tres cuerpos.

-- ---------- reversión: FALTABA el chequeo de location_id (item 3) ----------
create or replace function reverse_movement(p_movement_id uuid, p_description text default 'Reversión')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_original cash_movements%rowtype;
  v_account_location uuid;
  v_new_direction movement_direction;
  v_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para revertir movimientos';
  end if;

  select * into v_original from cash_movements where id = p_movement_id;
  if v_original is null then
    raise exception 'Movimiento no encontrado';
  end if;

  -- FIX Fase 1.1: antes se revertía cualquier movimiento sin validar que la
  -- cuenta perteneciera a la ubicación del usuario -- bypass de aislamiento
  -- por location_id detectado en la auditoría.
  select location_id into v_account_location from cash_accounts where id = v_original.account_id;
  if v_account_location is null or v_account_location <> current_profile_location() then
    raise exception 'No podés revertir un movimiento de otra ubicación';
  end if;

  v_new_direction := case when v_original.direction = 'ingreso' then 'egreso' else 'ingreso' end;

  begin
    insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
    values (v_original.account_id, v_original.amount, v_new_direction, current_date, 'reversal', v_original.id, p_description, auth.uid())
    returning id into v_id;
  exception
    when unique_violation then
      -- El índice único parcial one_reversal_per_movement (0004) es la garantía
      -- real contra doble reversión bajo concurrencia -- el "exists" de abajo es
      -- solo para dar un mensaje claro en el caso no concurrente.
      raise exception 'Este movimiento ya fue revertido';
  end;

  return v_id;
end;
$$;

-- El "exists" previo se elimina porque ya no hace falta -- el unique_violation
-- capturado arriba cubre tanto el caso concurrente como el secuencial con el
-- mismo mensaje, sin una consulta extra. (Comentario informativo, no ejecuta nada.)

-- ---------- transferencia: cuentas inexistentes no deben pasar silenciosamente (item 6) ----------
create or replace function transfer_between_accounts(
  p_from_account uuid, p_to_account uuid, p_amount numeric, p_date date, p_description text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_loc_from uuid; v_loc_to uuid;
begin
  if not has_permission('accounts', true) then
    raise exception 'Sin permiso para transferir entre cuentas';
  end if;
  if p_from_account = p_to_account then
    raise exception 'La cuenta de origen y destino no pueden ser la misma';
  end if;
  if p_amount <= 0 then
    raise exception 'El monto de la transferencia debe ser positivo';
  end if;

  select location_id into v_loc_from from cash_accounts where id = p_from_account;
  select location_id into v_loc_to from cash_accounts where id = p_to_account;

  -- FIX Fase 1.1: antes, si una de las cuentas no existía, v_loc quedaba NULL y
  -- la comparación "<>" con NULL nunca da TRUE en plpgsql (dispara ni el IF ni
  -- el error) -- la transferencia fallaba recién por la FK al insertar, con un
  -- error genérico. Ahora se valida explícitamente antes de intentar nada.
  if v_loc_from is null or v_loc_to is null then
    raise exception 'Una de las cuentas no existe';
  end if;
  if v_loc_from <> current_profile_location() or v_loc_to <> current_profile_location() then
    raise exception 'Cuentas inválidas para tu ubicación';
  end if;

  -- Atomicidad: ambos INSERT están dentro de la misma invocación de función,
  -- que Postgres ejecuta como una única transacción implícita -- si el segundo
  -- INSERT fallara, el primero se revierte automáticamente. No puede quedar
  -- una transferencia "a medias".
  insert into cash_movements (account_id, amount, direction, date, origin_type, transfer_group_id, description, created_by)
  values (p_from_account, p_amount, 'egreso', p_date, 'transfer', v_group, p_description, auth.uid());

  insert into cash_movements (account_id, amount, direction, date, origin_type, transfer_group_id, description, created_by)
  values (p_to_account, p_amount, 'ingreso', p_date, 'transfer', v_group, p_description, auth.uid());

  return v_group;
end;
$$;

-- ---------- venta: validación completa server-side (item 4) ----------
create or replace function record_sale(
  p_channel_id uuid, p_external_order_number text, p_items jsonb, p_payment_method text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric(14,2) := 0;
  v_item jsonb;
  v_channel_active boolean;
  v_product_location uuid;
  v_product_active boolean;
  v_qty numeric;
  v_price numeric;
begin
  if not has_permission('sales', true) then
    raise exception 'Sin permiso para registrar ventas';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  select active into v_channel_active from channels where id = p_channel_id;
  if v_channel_active is null then
    raise exception 'Canal inválido';
  end if;
  if not v_channel_active then
    raise exception 'El canal seleccionado no está habilitado';
  end if;

  -- Validar TODOS los items antes de insertar nada (si algo falla acá, no se
  -- crea ni el order ni ningún order_item -- misma garantía de atomicidad que
  -- en transfer_between_accounts).
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not (v_item ? 'product_id') or not (v_item ? 'quantity') or not (v_item ? 'unit_price') then
      raise exception 'Cada item requiere product_id, quantity y unit_price';
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida para el producto %', v_item->>'product_id';
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'Precio inválido para el producto %', v_item->>'product_id';
    end if;

    select location_id, active into v_product_location, v_product_active
      from products where id = (v_item->>'product_id')::uuid;

    if v_product_location is null then
      raise exception 'El producto % no existe', v_item->>'product_id';
    end if;
    if not v_product_active then
      raise exception 'El producto % está inactivo', v_item->>'product_id';
    end if;
    if v_product_location <> current_profile_location() then
      raise exception 'El producto % no pertenece a tu ubicación', v_item->>'product_id';
    end if;
  end loop;

  select coalesce(sum((i->>'quantity')::numeric * (i->>'unit_price')::numeric), 0)
    into v_subtotal
  from jsonb_array_elements(p_items) i;

  insert into orders (location_id, channel_id, external_order_number, subtotal, total, payment_method, created_by)
  values (current_profile_location(), p_channel_id, p_external_order_number, v_subtotal, v_subtotal, p_payment_method, auth.uid())
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into order_items (order_id, product_id, quantity, unit_price)
    values (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::numeric, (v_item->>'unit_price')::numeric);
  end loop;

  return v_order_id;
end;
$$;

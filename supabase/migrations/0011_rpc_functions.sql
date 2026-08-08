-- 0011_rpc_functions.sql
-- Toda escritura financiera pasa por acá. security definer + FOR UPDATE en la fila
-- de origen es lo que evita condiciones de carrera (pagar dos veces, duplicar cobros).
-- Cada función valida permiso y location_id manualmente (bypassea RLS por ser definer).

-- ---------- saldo inicial ----------
create or replace function create_opening_balance(
  p_account_id uuid, p_amount numeric, p_direction movement_direction,
  p_date date, p_description text default 'Saldo inicial'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_location uuid;
  v_id uuid;
begin
  if not has_permission('accounts', true) then
    raise exception 'Sin permiso para cargar saldo inicial';
  end if;

  select location_id into v_location from cash_accounts where id = p_account_id;
  if v_location is null or v_location <> current_profile_location() then
    raise exception 'Cuenta inválida para tu ubicación';
  end if;

  if exists (
    select 1 from cash_movements m
    where m.account_id = p_account_id and m.origin_type = 'opening_balance'
      and not exists (
        select 1 from cash_movements r where r.origin_type = 'reversal' and r.origin_id = m.id
      )
  ) then
    raise exception 'Esta cuenta ya tiene un saldo inicial vigente. Revertilo primero si necesitás corregirlo.';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, description, created_by)
  values (p_account_id, p_amount, p_direction, p_date, 'opening_balance', p_description, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- pagar obligación a proveedor ----------
create or replace function pay_obligation(
  p_obligation_id uuid, p_account_id uuid, p_date date, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_obligation obligations%rowtype;
  v_account_location uuid;
  v_supplier_location uuid;
  v_movement_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para registrar pagos';
  end if;

  select * into v_obligation from obligations where id = p_obligation_id for update;
  if v_obligation is null then
    raise exception 'Obligación no encontrada';
  end if;
  if v_obligation.status <> 'pending' then
    raise exception 'Esta obligación ya fue pagada';
  end if;

  select location_id into v_supplier_location from suppliers where id = v_obligation.supplier_id;
  select location_id into v_account_location from cash_accounts where id = p_account_id;
  if v_supplier_location <> current_profile_location() or v_account_location <> current_profile_location() then
    raise exception 'Proveedor o cuenta inválidos para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
  values (p_account_id, v_obligation.amount, 'egreso', p_date, 'supplier_payment', v_obligation.id, p_description, auth.uid())
  returning id into v_movement_id;

  update obligations set status = 'paid', paid_movement_id = v_movement_id where id = p_obligation_id;

  return v_movement_id;
end;
$$;

-- ---------- pagar gasto ----------
create or replace function pay_expense(
  p_expense_id uuid, p_account_id uuid, p_date date, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_expense expenses%rowtype;
  v_account_location uuid;
  v_movement_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para registrar pagos de gastos';
  end if;

  select * into v_expense from expenses where id = p_expense_id for update;
  if v_expense is null then
    raise exception 'Gasto no encontrado';
  end if;
  if v_expense.status <> 'pending' then
    raise exception 'Este gasto ya fue pagado';
  end if;

  select location_id into v_account_location from cash_accounts where id = p_account_id;
  if v_expense.location_id <> current_profile_location() or v_account_location <> current_profile_location() then
    raise exception 'Gasto o cuenta inválidos para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
  values (p_account_id, v_expense.amount, 'egreso', p_date, 'expense', v_expense.id, coalesce(p_description, v_expense.description), auth.uid())
  returning id into v_movement_id;

  update expenses set status = 'paid', paid_movement_id = v_movement_id where id = p_expense_id;

  return v_movement_id;
end;
$$;

-- ---------- transferencia entre cuentas ----------
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

  select location_id into v_loc_from from cash_accounts where id = p_from_account;
  select location_id into v_loc_to from cash_accounts where id = p_to_account;
  if v_loc_from <> current_profile_location() or v_loc_to <> current_profile_location() then
    raise exception 'Cuentas inválidas para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, transfer_group_id, description, created_by)
  values (p_from_account, p_amount, 'egreso', p_date, 'transfer', v_group, p_description, auth.uid());

  insert into cash_movements (account_id, amount, direction, date, origin_type, transfer_group_id, description, created_by)
  values (p_to_account, p_amount, 'ingreso', p_date, 'transfer', v_group, p_description, auth.uid());

  return v_group;
end;
$$;

-- ---------- movimiento manual (ajuste) ----------
create or replace function create_manual_movement(
  p_account_id uuid, p_amount numeric, p_direction movement_direction, p_date date, p_description text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_location uuid;
  v_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para registrar movimientos manuales';
  end if;
  if p_description is null or length(trim(p_description)) = 0 then
    raise exception 'Todo movimiento manual requiere descripción';
  end if;

  select location_id into v_location from cash_accounts where id = p_account_id;
  if v_location <> current_profile_location() then
    raise exception 'Cuenta inválida para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, description, created_by)
  values (p_account_id, p_amount, p_direction, p_date, 'manual_adjustment', p_description, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- reversión de un movimiento ----------
create or replace function reverse_movement(p_movement_id uuid, p_description text default 'Reversión')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_original cash_movements%rowtype;
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

  if exists (select 1 from cash_movements where origin_type = 'reversal' and origin_id = p_movement_id) then
    raise exception 'Este movimiento ya fue revertido';
  end if;

  v_new_direction := case when v_original.direction = 'ingreso' then 'egreso' else 'ingreso' end;

  insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
  values (v_original.account_id, v_original.amount, v_new_direction, current_date, 'reversal', v_original.id, p_description, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- retiro de socio ----------
create or replace function record_withdrawal(
  p_account_id uuid, p_amount numeric, p_date date, p_signal approval_signal, p_description text default 'Retiro de socio'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_location uuid;
  v_movement_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para registrar retiros';
  end if;
  select location_id into v_location from cash_accounts where id = p_account_id;
  if v_location <> current_profile_location() then
    raise exception 'Cuenta inválida para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, description, created_by)
  values (p_account_id, p_amount, 'egreso', p_date, 'withdrawal', p_description, auth.uid())
  returning id into v_movement_id;

  insert into withdrawals (partner_user_id, amount, date, approved_signal, movement_id)
  values (auth.uid(), p_amount, p_date, p_signal, v_movement_id);

  return v_movement_id;
end;
$$;

-- ---------- venta básica (order + items, sin generar movimiento -- eso es Fase 2) ----------
create or replace function record_sale(
  p_channel_id uuid, p_external_order_number text, p_items jsonb, p_payment_method text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric(14,2) := 0;
  v_item jsonb;
begin
  if not has_permission('sales', true) then
    raise exception 'Sin permiso para registrar ventas';
  end if;

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

-- Se otorga ejecución sobre todas las funciones del schema (helpers de solo lectura
-- + las RPC de escritura de arriba). Ninguna de estas funciones bypassea los checks
-- de has_permission()/location_id definidos dentro de cada una.
grant execute on all functions in schema public to authenticated;

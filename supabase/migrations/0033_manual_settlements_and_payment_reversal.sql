-- 0033_manual_settlements_and_payment_reversal.sql
-- Dos pedidos reales de uso:
--
-- 1. "la liquidación la quiero hacer manual" -- generate_settlement() (0018)
--    exige ventas cargadas vía record_sale() para agrupar. Panino no carga
--    venta por venta (decisión explícita del dueño del negocio), así que
--    ese flujo nunca tiene de dónde sacar datos. Se agrega un camino manual
--    que inserta la liquidación directo con el monto que el usuario ya
--    calculó afuera -- alimenta el mismo listExpectedInflows() que ya usa
--    financial-engine.ts, así que aparece en el calendario financiero
--    exactamente igual que una liquidación automática, sin tocar ese motor.
--
-- 2. "en gastos no me deja eliminar o editar" -- un gasto YA PAGADO es
--    inmutable a propósito (guard_expense_immutability, 0005) y hasta ahora
--    no existía ninguna forma de deshacerlo, ni siquiera vía reversión
--    (0032 solo cubrió pendientes). Se agrega reverse_expense_payment(),
--    mismo patrón que reverse_movement() (0014): revierte el movimiento de
--    caja Y devuelve el gasto a 'pending', donde ya se puede editar o volver
--    a pagar bien. Mismo tratamiento para obligations, por consistencia --
--    tenía exactamente el mismo problema aunque no se preguntó puntualmente.

-- ========== 1. Liquidación manual ==========

alter table settlements add column if not exists is_manual boolean not null default false;
alter table settlements add column if not exists notes text;

comment on column settlements.is_manual is
  'true = cargada a mano (create_manual_settlement), no agrupó ventas reales. Se muestra distinto en la UI para que quede claro de dónde salió el número.';

create or replace function create_manual_settlement(
  p_channel_id uuid,
  p_net_amount numeric,
  p_expected_payment_date date,
  p_period_start date default null,
  p_period_end date default null,
  p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_period_start date := coalesce(p_period_start, p_expected_payment_date);
  v_period_end date := coalesce(p_period_end, p_expected_payment_date);
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para cargar liquidaciones';
  end if;
  if p_net_amount is null or p_net_amount <= 0 then
    raise exception 'El monto a cobrar debe ser mayor a cero';
  end if;
  if not exists (select 1 from channels where id = p_channel_id) then
    raise exception 'Canal inválido';
  end if;

  insert into settlements (
    channel_id, location_id, period_start, period_end,
    gross_amount, commission_amount, discount_amount, adjustment_amount, net_amount,
    expected_payment_date, status, is_manual, notes
  ) values (
    p_channel_id, current_profile_location(), v_period_start, v_period_end,
    p_net_amount, 0, 0, 0, p_net_amount,
    p_expected_payment_date, 'pending', true, p_notes
  ) returning id into v_settlement_id;

  return v_settlement_id;
end;
$$;

comment on function create_manual_settlement(uuid, numeric, date, date, date, date, text) is
  'gross_amount = net_amount, commission_amount = 0 -- el usuario ya calculó el neto afuera de la app, no le pedimos que lo desglose de nuevo. collect_settlement() (0018) funciona igual sobre estas filas, no distingue manual de generada.';

-- ========== 2. Revertir pago de un gasto/obligación ya pagado ==========
-- Mismo patrón que reverse_movement() (0014): inserta un movimiento inverso
-- (nunca borra el original) y además devuelve la fila de origen a estado
-- pendiente, donde el PATCH que ya existe desde 0032 vuelve a poder editarla.

create or replace function reverse_expense_payment(p_expense_id uuid, p_description text default 'Reversión de pago de gasto')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_expense expenses%rowtype;
  v_movement cash_movements%rowtype;
  v_account_location uuid;
  v_new_direction movement_direction;
  v_reversal_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para revertir pagos de gastos';
  end if;

  select * into v_expense from expenses where id = p_expense_id for update;
  if v_expense is null then
    raise exception 'Gasto no encontrado';
  end if;
  if v_expense.location_id <> current_profile_location() then
    raise exception 'Gasto de otra ubicación';
  end if;
  if v_expense.status <> 'paid' or v_expense.paid_movement_id is null then
    raise exception 'Este gasto no está pagado -- no hay pago que revertir';
  end if;

  select * into v_movement from cash_movements where id = v_expense.paid_movement_id;
  select location_id into v_account_location from cash_accounts where id = v_movement.account_id;
  if v_account_location is null or v_account_location <> current_profile_location() then
    raise exception 'Movimiento de otra ubicación';
  end if;

  v_new_direction := case when v_movement.direction = 'ingreso' then 'egreso' else 'ingreso' end;

  begin
    insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
    values (v_movement.account_id, v_movement.amount, v_new_direction, current_date, 'reversal', v_movement.id, p_description, auth.uid())
    returning id into v_reversal_id;
  exception
    when unique_violation then
      raise exception 'Este pago ya fue revertido';
  end;

  update expenses set status = 'pending', paid_movement_id = null where id = p_expense_id;

  return v_reversal_id;
end;
$$;

create or replace function reverse_obligation_payment(p_obligation_id uuid, p_description text default 'Reversión de pago a proveedor')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_obligation obligations%rowtype;
  v_supplier_location uuid;
  v_movement cash_movements%rowtype;
  v_account_location uuid;
  v_new_direction movement_direction;
  v_reversal_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para revertir pagos a proveedores';
  end if;

  select * into v_obligation from obligations where id = p_obligation_id for update;
  if v_obligation is null then
    raise exception 'Obligación no encontrada';
  end if;

  -- obligations no tiene location_id propio (0012) -- se hereda de supplier_id.
  select location_id into v_supplier_location from suppliers where id = v_obligation.supplier_id;
  if v_supplier_location is null or v_supplier_location <> current_profile_location() then
    raise exception 'Obligación de otra ubicación';
  end if;

  if v_obligation.status <> 'paid' or v_obligation.paid_movement_id is null then
    raise exception 'Esta obligación no está pagada -- no hay pago que revertir';
  end if;

  select * into v_movement from cash_movements where id = v_obligation.paid_movement_id;
  select location_id into v_account_location from cash_accounts where id = v_movement.account_id;
  if v_account_location is null or v_account_location <> current_profile_location() then
    raise exception 'Movimiento de otra ubicación';
  end if;

  v_new_direction := case when v_movement.direction = 'ingreso' then 'egreso' else 'ingreso' end;

  begin
    insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
    values (v_movement.account_id, v_movement.amount, v_new_direction, current_date, 'reversal', v_movement.id, p_description, auth.uid())
    returning id into v_reversal_id;
  exception
    when unique_violation then
      raise exception 'Este pago ya fue revertido';
  end;

  update obligations set status = 'pending', paid_movement_id = null where id = p_obligation_id;

  return v_reversal_id;
end;
$$;

-- 0034_settlement_collection_reversal.sql
-- Encontrado al usar la liquidación manual de 0033: cobrar una liquidación
-- ya no tiene vuelta atrás -- collect_settlement (0018) marca status='collected'
-- y no hay forma de deshacerlo. El botón "Revertir" de /movements (0032)
-- deshace el impacto en caja, pero NUNCA le avisa a la tabla settlements --
-- queda para siempre marcada "cobrada" aunque la plata se haya revertido,
-- rompiendo la consistencia entre las dos tablas.
--
-- Mismo patrón que reverse_expense_payment/reverse_obligation_payment (0033):
-- revierte el movimiento de caja Y devuelve la liquidación a 'pending'.
--
-- Además: una liquidación manual cargada mal (monto/fecha equivocados) no
-- tenía ninguna forma de borrarse mientras estaba pendiente -- solo existía
-- generarla o cobrarla. delete_pending_manual_settlement cierra eso, pero
-- SOLO para is_manual=true: una liquidación generada desde ventas tiene
-- orders.settlement_id apuntando a ella, borrarla dejaría esas ventas en un
-- estado raro -- para esas, corregir es via el flujo de reversión, no borrado.

create or replace function reverse_settlement_collection(p_settlement_id uuid, p_description text default 'Reversión de cobro de liquidación')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement settlements%rowtype;
  v_movement cash_movements%rowtype;
  v_account_location uuid;
  v_new_direction movement_direction;
  v_reversal_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para revertir cobros de liquidaciones';
  end if;

  select * into v_settlement from settlements where id = p_settlement_id for update;
  if v_settlement is null then
    raise exception 'Liquidación no encontrada';
  end if;
  if v_settlement.location_id <> current_profile_location() then
    raise exception 'Liquidación de otra ubicación';
  end if;
  if v_settlement.status <> 'collected' or v_settlement.collection_movement_id is null then
    raise exception 'Esta liquidación no está cobrada -- no hay cobro que revertir';
  end if;

  select * into v_movement from cash_movements where id = v_settlement.collection_movement_id;
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
      raise exception 'Este cobro ya fue revertido';
  end;

  update settlements
    set status = 'pending', actual_payment_date = null, collection_movement_id = null
  where id = p_settlement_id;

  return v_reversal_id;
end;
$$;

create or replace function delete_pending_manual_settlement(p_settlement_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement settlements%rowtype;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para eliminar liquidaciones';
  end if;

  select * into v_settlement from settlements where id = p_settlement_id for update;
  if v_settlement is null then
    raise exception 'Liquidación no encontrada';
  end if;
  if v_settlement.location_id <> current_profile_location() then
    raise exception 'Liquidación de otra ubicación';
  end if;
  if not v_settlement.is_manual then
    raise exception 'Solo se pueden eliminar liquidaciones cargadas a mano -- una generada desde ventas tiene pedidos asociados, hay que revertir su cobro en vez de borrarla';
  end if;
  if v_settlement.status <> 'pending' then
    raise exception 'Esta liquidación ya fue cobrada -- primero hay que revertir el cobro (reverse_settlement_collection)';
  end if;

  delete from settlements where id = p_settlement_id;
end;
$$;

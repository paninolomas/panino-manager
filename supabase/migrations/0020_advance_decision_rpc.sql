-- 0020_advance_decision_rpc.sql
-- Fase 2. El cálculo del simulador (simulatePedidosYaAdvance /
-- recommendAdvanceDecision) vive en TypeScript puro (lib/services/financial-engine.ts)
-- -- es el motor determinístico. Esta RPC no recalcula nada: solo persiste
-- el resultado ya calculado, para que quede historial auditable de qué se
-- decidió y con qué parámetros (transparencia de la recomendación).

create or replace function record_advance_decision(
  p_settlement_id uuid,
  p_net_receivable numeric,
  p_normal_payment_date date,
  p_advance_date date,
  p_advance_fee_percent numeric,
  p_vat_percent numeric,
  p_advance_cost numeric,
  p_net_if_advance numeric,
  p_decision text,
  p_reason text,
  p_projected_available numeric
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement_location uuid;
  v_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para registrar esta decisión';
  end if;

  if p_settlement_id is not null then
    select location_id into v_settlement_location from settlements where id = p_settlement_id;
    if v_settlement_location is null or v_settlement_location <> current_profile_location() then
      raise exception 'Liquidación inválida para tu ubicación';
    end if;
  end if;

  if p_decision not in ('advance', 'wait') then
    raise exception 'Decisión inválida';
  end if;

  insert into advance_simulations (
    settlement_id, net_receivable, normal_payment_date, advance_date,
    advance_fee_percent, vat_percent, advance_cost, net_if_advance,
    decision, reason, projected_available_before_normal_date, created_by
  ) values (
    p_settlement_id, p_net_receivable, p_normal_payment_date, p_advance_date,
    p_advance_fee_percent, p_vat_percent, p_advance_cost, p_net_if_advance,
    p_decision, p_reason, p_projected_available, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

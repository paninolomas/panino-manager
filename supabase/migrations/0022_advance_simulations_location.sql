-- 0022_advance_simulations_location.sql
-- Fase 2, corrección propia antes de cerrar: advance_simulations.select
-- (0017) solo chequeaba has_permission('movements', false), sin filtrar por
-- location_id -- a diferencia de cash_movements/settlements/expenses, que sí
-- lo hacen. settlement_id es nullable (una decisión puede no estar atada a
-- una liquidación puntual), así que no alcanza con inferir la ubicación por
-- ese join. Se agrega location_id directo, igual que en el resto del schema.

alter table advance_simulations add column if not exists location_id uuid references locations(id);

-- Backfill para filas existentes que pudieran tener settlement_id (no debería
-- haber ninguna todavía en un ambiente nuevo, pero es correcto igual).
update advance_simulations a
  set location_id = s.location_id
  from settlements s
  where a.settlement_id = s.id and a.location_id is null;

drop policy if exists "advance_simulations select" on advance_simulations;
create policy "advance_simulations select" on advance_simulations for select
  using (has_permission('movements', false) and location_id = current_profile_location());

drop policy if exists "advance_simulations insert" on advance_simulations;
create policy "advance_simulations insert" on advance_simulations for insert
  with check (
    has_permission('movements', true)
    and created_by = auth.uid()
    and location_id = current_profile_location()
  );

-- record_advance_decision (0020) debe setear location_id explícitamente ahora.
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
    settlement_id, location_id, net_receivable, normal_payment_date, advance_date,
    advance_fee_percent, vat_percent, advance_cost, net_if_advance,
    decision, reason, projected_available_before_normal_date, created_by
  ) values (
    p_settlement_id, current_profile_location(), p_net_receivable, p_normal_payment_date, p_advance_date,
    p_advance_fee_percent, p_vat_percent, p_advance_cost, p_net_if_advance,
    p_decision, p_reason, p_projected_available, auth.uid()
  ) returning id into v_id;

  return v_id;
end;
$$;

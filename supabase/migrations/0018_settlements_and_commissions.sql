-- 0018_settlements_and_commissions.sql
-- Fase 2: liquidaciones reales (PedidosYa/Rappi) y comisión diferida de Pedix.

-- settlements no tenía location_id propio (0007) -- se agrega para poder
-- aplicar el mismo patrón de aislamiento por ubicación que el resto del
-- sistema (hardening de Fase 1.1), en vez de inferirlo indirectamente via
-- las orders asociadas.
alter table settlements add column if not exists location_id uuid references locations(id);

drop policy if exists "settlements select" on settlements;
create policy "settlements select" on settlements for select
  using (has_permission('movements', false) and location_id = current_profile_location());

drop policy if exists "commission_charges select" on commission_charges;
create policy "commission_charges select" on commission_charges for select
  using (
    has_permission('movements', false)
    and exists (
      select 1 from orders o where o.id = commission_charges.order_id and o.location_id = current_profile_location()
    )
  );

-- ---------- generar una liquidación agrupando ventas sin liquidar ----------
create or replace function generate_settlement(
  p_channel_id uuid, p_period_start date, p_period_end date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement_model settlement_model;
  v_gross numeric(14,2);
  v_commission_percent numeric(6,4);
  v_commission numeric(14,2);
  v_offset_days integer;
  v_settlement_id uuid;
  v_order_count integer;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para generar liquidaciones';
  end if;

  select settlement_model into v_settlement_model from channels where id = p_channel_id;
  if v_settlement_model is null then
    raise exception 'Canal inválido';
  end if;
  if v_settlement_model <> 'grouped' then
    raise exception 'Este canal cobra de forma inmediata -- no genera liquidaciones agrupadas';
  end if;

  select count(*), coalesce(sum(total), 0) into v_order_count, v_gross
  from orders
  where channel_id = p_channel_id
    and settlement_id is null
    and location_id = current_profile_location()
    and order_datetime::date between p_period_start and p_period_end;

  if v_order_count = 0 then
    raise exception 'No hay ventas sin liquidar de este canal en ese período';
  end if;

  select value_percent into v_commission_percent
  from channel_cost_items
  where channel_id = p_channel_id and type = 'commission' and valid_to is null;
  if v_commission_percent is null then
    raise exception 'El canal no tiene una comisión configurada (channel_cost_items) -- cargarla antes de liquidar';
  end if;

  select payment_offset_days into v_offset_days
  from channel_settlement_rules
  where channel_id = p_channel_id and valid_to is null;
  if v_offset_days is null then
    raise exception 'El canal no tiene una regla de liquidación vigente (channel_settlement_rules)';
  end if;

  v_commission := round(v_gross * v_commission_percent, 2);

  insert into settlements (
    channel_id, location_id, period_start, period_end,
    gross_amount, commission_amount, discount_amount, adjustment_amount, net_amount,
    expected_payment_date, status
  ) values (
    p_channel_id, current_profile_location(), p_period_start, p_period_end,
    v_gross, v_commission, 0, 0, v_gross - v_commission,
    p_period_end + v_offset_days, 'pending'
  ) returning id into v_settlement_id;

  update orders
    set settlement_id = v_settlement_id
  where channel_id = p_channel_id
    and settlement_id is null
    and location_id = current_profile_location()
    and order_datetime::date between p_period_start and p_period_end;

  return v_settlement_id;
end;
$$;

comment on function generate_settlement(uuid, date, date) is
  'Agrupa ventas sin liquidar de un canal "grouped" (PedidosYa/Rappi) en una liquidación. discount_amount y adjustment_amount quedan en 0 -- Fase 2 no modela descuentos/ajustes de plataforma todavía, ver Sección channel_cost_items para incorporarlos sin romper el schema.';

-- ---------- cobrar una liquidación ya generada ----------
create or replace function collect_settlement(
  p_settlement_id uuid, p_account_id uuid, p_date date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_settlement settlements%rowtype;
  v_account_location uuid;
  v_movement_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para registrar cobros';
  end if;

  select * into v_settlement from settlements where id = p_settlement_id for update;
  if v_settlement is null then
    raise exception 'Liquidación no encontrada';
  end if;
  if v_settlement.status <> 'pending' then
    raise exception 'Esta liquidación ya fue cobrada';
  end if;
  if v_settlement.location_id <> current_profile_location() then
    raise exception 'Liquidación de otra ubicación';
  end if;

  select location_id into v_account_location from cash_accounts where id = p_account_id;
  if v_account_location is null or v_account_location <> current_profile_location() then
    raise exception 'Cuenta inválida para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
  values (p_account_id, v_settlement.net_amount, 'ingreso', p_date, 'channel_collection', v_settlement.id, null, auth.uid())
  returning id into v_movement_id;

  update settlements
    set status = 'collected', actual_payment_date = p_date, collection_movement_id = v_movement_id
  where id = p_settlement_id;

  return v_movement_id;
end;
$$;

-- ---------- pagar la comisión pendiente de Pedix ----------
create or replace function pay_commission(
  p_commission_charge_id uuid, p_account_id uuid, p_date date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_commission commission_charges%rowtype;
  v_order_location uuid;
  v_account_location uuid;
  v_movement_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para pagar comisiones';
  end if;

  select * into v_commission from commission_charges where id = p_commission_charge_id for update;
  if v_commission is null then
    raise exception 'Comisión no encontrada';
  end if;
  if v_commission.status <> 'pending' then
    raise exception 'Esta comisión ya fue pagada';
  end if;

  select location_id into v_order_location from orders where id = v_commission.order_id;
  select location_id into v_account_location from cash_accounts where id = p_account_id;
  if v_order_location <> current_profile_location() or v_account_location <> current_profile_location() then
    raise exception 'Comisión o cuenta inválidas para tu ubicación';
  end if;

  insert into cash_movements (account_id, amount, direction, date, origin_type, origin_id, description, created_by)
  values (p_account_id, v_commission.amount, 'egreso', p_date, 'commission_payment', v_commission.id, null, auth.uid())
  returning id into v_movement_id;

  update commission_charges set status = 'paid', paid_movement_id = v_movement_id where id = p_commission_charge_id;

  return v_movement_id;
end;
$$;

-- ---------- record_sale: ahora genera automáticamente la comisión de Pedix ----------
-- Fase 1 dejó esto pendiente a propósito ("eso es Fase 2", ver 0011). Se
-- reemplaza el cuerpo (ya venía de 0014) agregando el paso de comisión.
create or replace function record_sale(
  p_channel_id uuid, p_external_order_number text, p_items jsonb, p_payment_method text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_subtotal numeric(14,2) := 0;
  v_item jsonb;
  v_channel_name text;
  v_channel_active boolean;
  v_product_location uuid;
  v_product_active boolean;
  v_qty numeric;
  v_price numeric;
  v_commission_percent numeric(6,4);
  v_commission_amount numeric(14,2);
  v_commission_offset_days integer;
  v_commission_charge_id uuid;
begin
  if not has_permission('sales', true) then
    raise exception 'Sin permiso para registrar ventas';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe tener al menos un producto';
  end if;

  select name, active into v_channel_name, v_channel_active from channels where id = p_channel_id;
  if v_channel_name is null then
    raise exception 'Canal inválido';
  end if;
  if not v_channel_active then
    raise exception 'El canal seleccionado no está habilitado';
  end if;

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

  -- Fase 2: si el canal es Pedix (cobro inmediato pero comisión diferida,
  -- confirmado explícitamente por el usuario), se genera automáticamente la
  -- CommissionCharge pendiente. Si el canal no tiene comisión configurada
  -- todavía, la venta se registra igual (no bloqueamos ventas por falta de
  -- configuración financiera) pero sin comisión -- se puede cargar la
  -- configuración y liquidar manualmente después si hiciera falta.
  if v_channel_name = 'pedix' then
    select value_percent into v_commission_percent
    from channel_cost_items
    where channel_id = p_channel_id and type = 'commission' and valid_to is null;

    select payment_offset_days into v_commission_offset_days
    from channel_settlement_rules
    where channel_id = p_channel_id and valid_to is null;

    if v_commission_percent is not null then
      v_commission_amount := round(v_subtotal * v_commission_percent, 2);
      insert into commission_charges (order_id, amount, estimated_payment_date, status)
      values (
        v_order_id,
        v_commission_amount,
        (current_date + coalesce(v_commission_offset_days, 15)),
        'pending'
      )
      returning id into v_commission_charge_id;

      update orders set commission_charge_id = v_commission_charge_id where id = v_order_id;
    end if;
  end if;

  return v_order_id;
end;
$$;

comment on function record_sale(uuid, text, jsonb, text) is
  'Fase 2: agrega generación automática de CommissionCharge para Pedix. El offset de pago de la comisión usa channel_settlement_rules.payment_offset_days si existe, si no default 15 días (placeholder documentado -- ajustar con el dato real de Panino vía UI/SQL, nunca hardcodeado en el código de la app).';

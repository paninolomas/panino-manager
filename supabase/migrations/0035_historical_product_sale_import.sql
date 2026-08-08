-- 0035_historical_product_sale_import.sql
-- import_order() (0029, Fase 7) acepta fecha histórica pero SOLO crea el
-- pedido a nivel total -- documentado ahí mismo: "no genera order_items,
-- Fase 7 importa a nivel de pedido, no de línea". sales_summary_by_product_channel
-- (0025, motor de rentabilidad) agrupa por oi.product_id -- un pedido sin
-- order_items no aporta nada a ningún cálculo de margen por producto.
--
-- Esta función es la que faltaba para el pedido real: "quiero que el
-- histórico de mayo-agosto esté para calcular rentabilidad vs costos y
-- comisiones". Crea UN pedido con UNA línea por (producto, canal, período)
-- a partir de datos ya agregados (unidades totales + ticket promedio del
-- reporte de PedidosYa) -- no pretende ser el detalle real venta por venta,
-- que nunca se cargó y el usuario decidió explícitamente no cargar.
--
-- Limitación real, documentada a propósito: todas las unidades de un mismo
-- producto quedan estampadas en UNA sola fecha (el fin del período, salvo
-- que se pase otra). Esto es correcto para sumar ingresos/unidades/margen
-- de TODO el período (que es exactamente lo que necesita el motor de
-- rentabilidad), pero DISTORSIONA cualquier cosa que dependa de la
-- distribución diaria real -- goals-engine (proyección semanal) y
-- stock-engine (consumo diario estimado) NO deben alimentarse de estos
-- pedidos importados como si fueran ventas día a día reales.

create or replace function import_historical_product_sale(
  p_channel_id uuid,
  p_product_id uuid,
  p_units numeric,
  p_unit_price numeric,
  p_order_date date,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_channel_active boolean;
  v_product_location uuid;
  v_order_id uuid;
  v_external_number text;
  v_subtotal numeric(14,2);
begin
  if not has_permission('sales', true) then
    raise exception 'Sin permiso para importar ventas';
  end if;
  if p_units is null or p_units <= 0 then
    raise exception 'Las unidades deben ser mayores a cero';
  end if;
  if p_unit_price is null or p_unit_price < 0 then
    raise exception 'El precio unitario no puede ser negativo';
  end if;

  select active into v_channel_active from channels where id = p_channel_id;
  if v_channel_active is null then
    raise exception 'Canal inválido';
  end if;

  select location_id into v_product_location from products where id = p_product_id;
  if v_product_location is null then
    raise exception 'Producto inválido';
  end if;
  if v_product_location <> current_profile_location() then
    raise exception 'Producto de otra ubicación';
  end if;

  v_subtotal := round(p_units * p_unit_price, 2);
  -- Determinístico por (fecha, canal, producto) -- reintentar la misma
  -- importación no duplica, reutiliza el índice único de 0029.
  v_external_number := 'HIST-' || p_order_date::text || '-' || p_channel_id::text || '-' || p_product_id::text;

  begin
    insert into orders (
      location_id, channel_id, external_order_number, order_datetime,
      subtotal, total, payment_method, created_by
    ) values (
      current_profile_location(), p_channel_id, v_external_number,
      p_order_date::timestamptz,
      v_subtotal, v_subtotal, p_note, auth.uid()
    )
    returning id into v_order_id;
  exception
    when unique_violation then
      raise exception 'Esta venta histórica (mismo producto/canal/fecha) ya se había importado antes';
  end;

  insert into order_items (order_id, product_id, quantity, unit_price)
  values (v_order_id, p_product_id, p_units, p_unit_price);

  return v_order_id;
end;
$$;

comment on function import_historical_product_sale(uuid, uuid, numeric, numeric, date, text) is
  'Import agregado (no venta por venta): un pedido + una línea por producto/canal/período, con las unidades y el ticket promedio ya calculados afuera. Ver comentario de la migración para la limitación real de goals-engine/stock-engine.';

grant execute on function import_historical_product_sale(uuid, uuid, numeric, numeric, date, text) to authenticated;

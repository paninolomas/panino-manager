-- 0029_import_order.sql
-- Fase 7. La deduplicación real (Sección 23/28: "detectar duplicados") se
-- hace con un constraint único en la base, no con una consulta previa desde
-- la aplicación -- eso es lo único que garantiza que dos filas del mismo
-- archivo (o dos importaciones del mismo archivo por error) no dupliquen la
-- misma venta, incluso si el cliente llama a la RPC en paralelo.

create unique index if not exists one_order_per_channel_external_number
  on orders (location_id, channel_id, external_order_number)
  where external_order_number is not null;

create or replace function import_order(
  p_channel_id uuid,
  p_external_order_number text,
  p_order_date date,
  p_total numeric,
  p_discount numeric default 0,
  p_payment_method text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_channel_active boolean;
  v_order_id uuid;
begin
  if not has_permission('sales', true) then
    raise exception 'Sin permiso para importar ventas';
  end if;
  if p_total <= 0 then
    raise exception 'El total debe ser positivo';
  end if;

  select active into v_channel_active from channels where id = p_channel_id;
  if v_channel_active is null then
    raise exception 'Canal inválido';
  end if;

  begin
    insert into orders (
      location_id, channel_id, external_order_number, order_datetime,
      subtotal, discount, total, payment_method, created_by
    ) values (
      current_profile_location(), p_channel_id, p_external_order_number,
      p_order_date::timestamptz,
      p_total, coalesce(p_discount, 0), p_total,
      p_payment_method, auth.uid()
    )
    returning id into v_order_id;
  exception
    when unique_violation then
      raise exception 'Pedido duplicado: ya existe una venta de este canal con ese número de pedido';
  end;

  return v_order_id;
end;
$$;

comment on function import_order(uuid, text, date, numeric, numeric, text) is
  'Fase 7: crea un order a partir de una fila importada. No genera order_items (Fase 7 importa a nivel de pedido, no de línea -- ver README) ni commission_charge de Pedix automáticamente (gap documentado, a diferencia de record_sale). subtotal se asume igual a total cuando el archivo solo trae un monto total, sin desglose -- discount es informativo.';

grant execute on function import_order(uuid, text, date, numeric, numeric, text) to authenticated;

-- Las tablas de soporte de importación ya existían desde Fase 1 (0008) pero
-- sin uso funcional. Se agrega location_id a import_batches (faltaba) para
-- mantener el mismo aislamiento que el resto del sistema.
alter table import_batches add column if not exists location_id uuid references locations(id);

drop policy if exists "import_batches all" on import_batches;
create policy "import_batches select" on import_batches for select
  using (has_permission('sales', false) and (location_id is null or location_id = current_profile_location()));
create policy "import_batches insert" on import_batches for insert
  with check (has_permission('sales', true) and location_id = current_profile_location());

drop policy if exists "mapping_templates all" on column_mapping_templates;
create policy "mapping_templates select" on column_mapping_templates for select
  using (has_permission('sales', false));
create policy "mapping_templates write" on column_mapping_templates for all
  using (has_permission('sales', true)) with check (has_permission('sales', true));

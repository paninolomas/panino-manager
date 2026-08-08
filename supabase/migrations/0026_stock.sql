-- 0026_stock.sql
-- Fase 4. Sin recetas todavía (Fase 7) -- el consumo se estima desde el
-- historial de stock_movements, no desde ventas×receta (ver comentario en
-- lib/services/stock-engine.ts). stock_movements sigue el mismo patrón
-- insert-only que cash_movements (0004): ningún nivel de stock se edita
-- directo, toda corrección es un movimiento nuevo.

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  unit text not null, -- 'kg', 'unidad', 'litro', etc. -- texto libre a propósito, sin catálogo rígido en el MVP
  min_stock numeric(10,2) not null default 0,
  safety_stock numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type stock_movement_direction as enum ('entrada', 'salida');
create type stock_movement_origin_type as enum (
  'purchase', 'consumption_manual', 'waste', 'adjustment', 'reversal'
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id),
  quantity numeric(10,2) not null check (quantity > 0),
  direction stock_movement_direction not null,
  date date not null,
  origin_type stock_movement_origin_type not null,
  origin_id uuid, -- referencia al movimiento original cuando origin_type='reversal'
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),

  constraint reversal_requires_origin_stock
    check (origin_type <> 'reversal' or origin_id is not null)
);

comment on table stock_movements is
  'Insert-only, mismo principio que cash_movements: el nivel de stock siempre se deriva de SUM(entrada) - SUM(salida), nunca se edita directo.';

create unique index if not exists one_reversal_per_stock_movement
  on stock_movements (origin_id)
  where origin_type = 'reversal';
create index if not exists idx_stock_movements_item_date on stock_movements (stock_item_id, date);

-- Módulo 'stock': socio y empleado tienen acceso -- el prompt original
-- (Sección 33) dice explícitamente que los empleados sí pueden ver/operar
-- stock y compras, a diferencia de caja/gastos/márgenes.
insert into role_permissions (role, module, can_read, can_write) values
  ('socio', 'stock', true, true),
  ('empleado', 'stock', true, true)
on conflict (role, module) do nothing;

alter table stock_items enable row level security;
create policy "stock_items select" on stock_items for select
  using (has_permission('stock', false) and location_id = current_profile_location());
create policy "stock_items insert" on stock_items for insert
  with check (has_permission('stock', true) and location_id = current_profile_location());
create policy "stock_items update" on stock_items for update
  using (has_permission('stock', true) and location_id = current_profile_location());

alter table stock_movements enable row level security;
create policy "stock_movements select" on stock_movements for select
  using (
    has_permission('stock', false)
    and exists (select 1 from stock_items si where si.id = stock_movements.stock_item_id and si.location_id = current_profile_location())
  );
-- Sin policy de insert/update/delete para 'authenticated' -- igual que
-- cash_movements, toda escritura pasa por las RPC de abajo.
revoke insert, update, delete on stock_movements from authenticated;
grant select on stock_movements to authenticated;

-- ---------- registrar un movimiento de stock ----------
create or replace function create_stock_movement(
  p_stock_item_id uuid, p_quantity numeric, p_direction stock_movement_direction,
  p_date date, p_origin_type stock_movement_origin_type, p_description text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_location uuid;
  v_id uuid;
begin
  if not has_permission('stock', true) then
    raise exception 'Sin permiso para registrar movimientos de stock';
  end if;
  if p_origin_type = 'reversal' then
    raise exception 'Usar reverse_stock_movement() para revertir, no create_stock_movement()';
  end if;

  select location_id into v_location from stock_items where id = p_stock_item_id;
  if v_location is null or v_location <> current_profile_location() then
    raise exception 'Insumo inválido para tu ubicación';
  end if;

  insert into stock_movements (stock_item_id, quantity, direction, date, origin_type, description, created_by)
  values (p_stock_item_id, p_quantity, p_direction, p_date, p_origin_type, p_description, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------- revertir un movimiento de stock (ej. error de carga) ----------
create or replace function reverse_stock_movement(p_movement_id uuid, p_description text default 'Reversión')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_original stock_movements%rowtype;
  v_location uuid;
  v_new_direction stock_movement_direction;
  v_id uuid;
begin
  if not has_permission('stock', true) then
    raise exception 'Sin permiso para revertir movimientos de stock';
  end if;

  select * into v_original from stock_movements where id = p_movement_id;
  if v_original is null then
    raise exception 'Movimiento no encontrado';
  end if;

  select location_id into v_location from stock_items where id = v_original.stock_item_id;
  if v_location <> current_profile_location() then
    raise exception 'No podés revertir un movimiento de otra ubicación';
  end if;

  v_new_direction := case when v_original.direction = 'entrada' then 'salida' else 'entrada' end;

  begin
    insert into stock_movements (stock_item_id, quantity, direction, date, origin_type, origin_id, description, created_by)
    values (v_original.stock_item_id, v_original.quantity, v_new_direction, current_date, 'reversal', v_original.id, p_description, auth.uid())
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Este movimiento ya fue revertido';
  end;

  return v_id;
end;
$$;

grant execute on function create_stock_movement(uuid, numeric, stock_movement_direction, date, stock_movement_origin_type, text) to authenticated;
grant execute on function reverse_stock_movement(uuid, text) to authenticated;

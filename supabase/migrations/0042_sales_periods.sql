-- 0042_sales_periods.sql
-- Fase 19: carga MANUAL de cantidades vendidas por rango de fechas, para
-- sacar conclusiones de venta -- sistema NUEVO e independiente del viejo
-- "Recalcular rentabilidad" / margin_snapshots (decisión confirmada con el
-- usuario: no es la vuelta a ese sistema).
--
-- Cada línea guarda una FOTO CONGELADA de precio/costo/ganancia por unidad
-- al momento de cargar las cantidades (unit_price/unit_cost/
-- unit_net_profit), no una referencia viva a channel_prices/current_cost.
-- Motivo: precio, costo y descuento son editables y van a seguir
-- cambiando -- si un período viejo leyera los valores de HOY, comparar
-- "quincena de agosto" contra "quincena de septiembre" compararía cosas
-- distintas cada vez que se abre la pantalla. Con la foto congelada, un
-- período ya cargado no se mueve más.

create table if not exists sales_periods (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  label text,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists sales_period_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references sales_periods(id) on delete cascade,
  product_id uuid not null references products(id),
  channel_id uuid not null references channels(id),
  quantity numeric not null check (quantity >= 0),
  -- Foto del momento de carga (ver comentario arriba) -- unit_net_profit ya
  -- viene con comisión + regalía + pago en línea + descuento restados
  -- (mismo cálculo que "Ganancia real" en la calculadora), calculado en
  -- TypeScript puro (calculateProductProfitability) antes de insertar acá,
  -- nunca en SQL.
  unit_price numeric not null,
  unit_cost numeric not null,
  unit_net_profit numeric not null,
  created_at timestamptz not null default now(),
  unique (period_id, product_id, channel_id)
);

create index if not exists sales_period_items_period_idx on sales_period_items (period_id);

alter table sales_periods enable row level security;
create policy "sales_periods select" on sales_periods for select
  using (has_permission('expenses', false) and location_id = current_profile_location());
create policy "sales_periods write" on sales_periods for all
  using (has_permission('expenses', true) and location_id = current_profile_location())
  with check (has_permission('expenses', true) and location_id = current_profile_location() and created_by = auth.uid());

alter table sales_period_items enable row level security;
create policy "sales_period_items select" on sales_period_items for select
  using (
    has_permission('expenses', false)
    and exists (select 1 from sales_periods sp where sp.id = sales_period_items.period_id and sp.location_id = current_profile_location())
  );
create policy "sales_period_items write" on sales_period_items for all
  using (
    has_permission('expenses', true)
    and exists (select 1 from sales_periods sp where sp.id = sales_period_items.period_id and sp.location_id = current_profile_location())
  )
  with check (
    has_permission('expenses', true)
    and exists (select 1 from sales_periods sp where sp.id = sales_period_items.period_id and sp.location_id = current_profile_location())
  );

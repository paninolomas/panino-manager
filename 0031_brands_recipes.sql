-- 0031_brands_recipes.sql
-- Fase 8: marca, costo de insumos versionado, y recetas (BOM) por producto.
--
-- Cierra un hueco documentado desde Fase 4 (comentario en stock-engine.ts):
-- "las recetas/ingredientes son Fase 7 (post-MVP)" -- ese "Fase 7" original
-- terminó siendo el wizard de importación de CSV, y recetas nunca se
-- implementó. products.current_cost seguía siendo un número plano cargado a
-- mano, y stock_items no guardaba costo unitario en ningún lado.
--
-- Ver documento de arquitectura Fase8_Marca_Recetas_Insumos_Arquitectura.md
-- para el detalle de las decisiones (aprobado antes de esta migración).

-- ---------- 1. Marcas ----------

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  exclusive_channel_id uuid references channels(id), -- null = vende en todos los canales habilitados
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

comment on table brands is
  'Marcas del negocio (Panino, Nino, Goat). exclusive_channel_id modela reglas como "Goat solo vende en Rappi" -- no se valida con un constraint de tabla (requeriría subquery cruzando channel_prices, mismo criterio que orders.settlement_matches_channel_model en 0007), se valida en la capa de servicios antes de crear/activar un channel_price para un producto de marca exclusiva.';

alter table products add column if not exists brand_id uuid references brands(id);
-- Nullable a propósito: no romper productos ya cargados sin marca. Se puede
-- exigir not null en una migración posterior una vez poblado el catálogo.

-- ---------- 2. Costo de insumos, versionado ----------
-- Mismo patrón que channel_prices (0007): un costo activo por insumo,
-- histórico preservado vía valid_from/valid_to.

create table if not exists stock_item_costs (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  valid_from date not null default current_date,
  valid_to date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

comment on column stock_item_costs.unit_cost is
  'numeric(14,4), no (14,2): insumos como "Sal fina" cuestan fracciones de peso chicas (0,002 kg) -- con 2 decimales en el costo del insumo entero se pierde precisión real al multiplicar.';

create unique index if not exists one_active_cost_per_stock_item
  on stock_item_costs (stock_item_id)
  where valid_to is null;

create index if not exists idx_stock_item_costs_item on stock_item_costs (stock_item_id, valid_from desc);

-- ---------- 3. Receta (BOM): qué insumos y en qué cantidad componen un producto ----------

create table if not exists product_recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  quantity numeric(10,4) not null check (quantity > 0),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (product_id, stock_item_id)
);

comment on table product_recipe_items is
  'La receta en sí. quantity en la unidad del stock_item (kg/unidad/litro, texto libre igual que Fase 4). Un producto SIN filas acá no tiene receta cargada todavía -> el motor sigue usando products.current_cost como fallback manual, no rompe nada de lo que ya funciona. Deliberadamente plano (sin sub-recetas reutilizables) -- se puede extender después sin romper este modelo.';

create index if not exists idx_product_recipe_items_product on product_recipe_items (product_id);

-- ---------- 4. Permisos ----------
-- Mismo criterio que products/channel_prices desde 0010: el costo es
-- información sensible -> módulo 'expenses' (solo socio), no 'stock'
-- (donde empleado sí puede leer/escribir cantidades). brands es lectura
-- para cualquiera con 'sales' (el empleado la necesita para operar), pero
-- escritura solo 'expenses'.

alter table brands enable row level security;
create policy "brands select" on brands for select
  using (has_permission('sales', false) and location_id = current_profile_location());
create policy "brands write" on brands for all
  using (has_permission('expenses', true) and location_id = current_profile_location())
  with check (has_permission('expenses', true) and location_id = current_profile_location());

alter table stock_item_costs enable row level security;
create policy "stock_item_costs select" on stock_item_costs for select
  using (
    has_permission('expenses', false)
    and exists (select 1 from stock_items si where si.id = stock_item_costs.stock_item_id and si.location_id = current_profile_location())
  );
create policy "stock_item_costs write" on stock_item_costs for all
  using (
    has_permission('expenses', true)
    and exists (select 1 from stock_items si where si.id = stock_item_costs.stock_item_id and si.location_id = current_profile_location())
  )
  with check (
    has_permission('expenses', true)
    and exists (select 1 from stock_items si where si.id = stock_item_costs.stock_item_id and si.location_id = current_profile_location())
    and created_by = auth.uid()
  );

alter table product_recipe_items enable row level security;
create policy "product_recipe_items select" on product_recipe_items for select
  using (
    has_permission('expenses', false)
    and exists (select 1 from products p where p.id = product_recipe_items.product_id and p.location_id = current_profile_location())
  );
create policy "product_recipe_items write" on product_recipe_items for all
  using (
    has_permission('expenses', true)
    and exists (select 1 from products p where p.id = product_recipe_items.product_id and p.location_id = current_profile_location())
  )
  with check (
    has_permission('expenses', true)
    and exists (select 1 from products p where p.id = product_recipe_items.product_id and p.location_id = current_profile_location())
    and created_by = auth.uid()
  );

-- ---------- 5. Función de lectura para el motor TS (recipe-engine.ts) ----------
-- Igual que sales_summary_by_product_channel (0025): SQL solo agrega/junta
-- filas, el cálculo de costo en sí lo hace TypeScript puro, nunca acá.

create or replace function product_recipe_with_costs(p_product_id uuid)
returns table (stock_item_id uuid, stock_item_name text, unit text, quantity numeric, unit_cost numeric)
language sql
stable
security definer set search_path = public
as $$
  select
    si.id,
    si.name,
    si.unit,
    pri.quantity,
    coalesce(sic.unit_cost, 0)
  from product_recipe_items pri
  join stock_items si on si.id = pri.stock_item_id
  join products p on p.id = pri.product_id
  left join stock_item_costs sic on sic.stock_item_id = si.id and sic.valid_to is null
  where pri.product_id = p_product_id
    and p.location_id = current_profile_location()
    and has_permission('expenses', false);
$$;

comment on function product_recipe_with_costs(uuid) is
  'Única fuente de datos para recipe-engine.ts: insumos, cantidades y costo unitario activo de un producto. Si un insumo no tiene costo cargado (stock_item_costs), devuelve unit_cost=0 -- el motor TS decide qué hacer con eso (mismo principio "nunca inventar datos" de stock-engine.ts: no rellenar con un número que parezca preciso sin serlo).';

grant execute on function product_recipe_with_costs(uuid) to authenticated;

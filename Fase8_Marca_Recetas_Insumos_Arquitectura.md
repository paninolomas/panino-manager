# Fase 8 — Marca, Recetas e Insumos con costo

**Estado:** propuesta, sin implementar. Ningún cambio de código ni migración hasta aprobación.

## 1. Problema

Revisé el repo (`panino-manager-main.zip`) contra los Excel de recetas que armamos. Encontré tres huecos reales en el modelo de datos actual:

1. **No existe "marca".** `products` no tiene columna `brand`. Panino/Nino/Goat no tienen dónde vivir.
2. **No existen recetas.** Confirmado en comentario propio del código (`stock-engine.ts`): *"las recetas/ingredientes son Fase 7 (post-MVP) -- todavía no existe una forma de inferir consumo como 'ventas × receta'"*. Ese "Fase 7" original terminó siendo el wizard de importación de CSV; recetas nunca se implementó. `products.current_cost` es un número plano, cargado a mano.
3. **`stock_items` no guarda costo unitario.** Solo trackea cantidades (entrada/salida) vía `stock_movements`. El costo de un insumo (ej. Lomo 150 → $2.153,09) no tiene tabla.

Esta fase cierra los tres huecos.

## 2. Alcance

**Dentro de alcance:**
- Tabla de marcas, con la regla de negocio "Goat solo vende en Rappi".
- Costo de insumo versionado en el tiempo (los precios de compra cambian).
- Receta (BOM — bill of materials): qué insumos y en qué cantidad componen cada producto.
- `current_cost` de un producto pasa a poder derivarse de su receta, calculado en TypeScript puro (nunca en SQL), respetando la separación de responsabilidades ya establecida en el proyecto.

**Fuera de alcance (decisión explícita, no descuido):**
- Sub-recetas (ej. "papas con huevo" como receta propia reutilizable dentro de otra receta). Se puede agregar después sin romper este modelo; por ahora cada producto tiene una lista plana de insumos.
- Recalcular automáticamente `margin_snapshots` históricos cuando cambia una receta. Los snapshots existentes quedan como están (son fotos de un momento); solo los cálculos nuevos usan la receta.
- Vincular receta → consumo de stock automático (que `record_sale()` descuente stock según receta). Ya existe un mecanismo separado y funcionando (`stock_movements` manuales/por compra) — conectarlo es un cambio de comportamiento en producción, mejor evaluarlo aparte una vez que las recetas estén cargadas y validadas.

## 3. Modelo de datos propuesto

### 3.1 `brands`

```sql
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  exclusive_channel_id uuid references channels(id), -- null = vende en todos los canales habilitados
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);
```

- Panino y Nino: `exclusive_channel_id = null`.
- Goat: `exclusive_channel_id` = id del canal Rappi.
- La regla "Goat solo en Rappi" **no se valida con un constraint de tabla** (requeriría subquery cruzando `channel_prices`, mismo criterio que ya usan en `orders.settlement_matches_channel_model`) — se valida en la capa de servicios antes de crear/activar un `channel_price` para un producto de marca exclusiva.

`products` gana una columna:

```sql
alter table products add column brand_id uuid references brands(id);
```

Nullable en la migración (para no romper productos ya cargados sin marca); se puede exigir `not null` en una migración posterior una vez poblado.

### 3.2 `stock_item_costs` (costo de insumo, versionado)

Mismo patrón que `channel_prices` (0007): un costo activo por insumo, histórico preservado.

```sql
create table if not exists stock_item_costs (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  valid_from date not null default current_date,
  valid_to date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_cost_per_stock_item
  on stock_item_costs (stock_item_id)
  where valid_to is null;
```

`numeric(14,4)` en vez de `(14,2)`: insumos como "Sal fina" cuestan $3,27 por 2 gramos — con 2 decimales en el costo unitario del insumo entero se pierde precisión al multiplicar por cantidades chicas (0,002).

### 3.3 `product_recipe_items` (la receta / BOM)

```sql
create table if not exists product_recipe_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id),
  quantity numeric(10,4) not null check (quantity > 0),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (product_id, stock_item_id)
);
```

- `quantity` en la unidad del `stock_item` (kg, unidad, litro — ya definida en `stock_items.unit`, sin catálogo rígido, mismo criterio que Fase 4).
- Un producto sin filas acá = sin receta cargada todavía → el motor sigue usando `products.current_cost` (fallback, no rompe nada de lo que ya funciona).

### 3.4 Motor puro: `recipe-engine.ts` (nuevo)

Responsabilidad única: dado un `product_id`, sus `product_recipe_items` y los `stock_item_costs` activos, calcular el costo total del producto. Función pura, sin Supabase, mismo patrón que `financial-engine.ts` / `profitability-engine.ts` / `stock-engine.ts`.

`profitability-engine.ts` cambia en un solo punto: donde hoy lee `product.current_cost` directo, primero pregunta si hay receta cargada; si la hay, usa `recipe-engine.ts`; si no, cae al `current_cost` manual. Cero cambios en la lógica de margen en sí.

## 4. Permisos / RLS

`stock_item_costs` y `product_recipe_items` quedan bajo el módulo **`expenses`** (no `stock`) — mismo criterio que ya usa el proyecto para `products`/`channel_prices` (comentario en 0010: *"empleado no tiene módulo 'products' en Fase 1 → sin acceso a costos"*). Los insumos en sí (`stock_items`, cantidades) siguen siendo `stock` (empleado lee/escribe), pero el **costo** de esos insumos es información sensible → solo socio, igual que el resto de los costos del negocio.

`brands`: lectura para cualquiera con módulo `sales` (empleado la necesita para operar), escritura solo `expenses` (socio).

## 5. Numeración de la migración — una cosa para confirmar

El zip que me pasaste llega hasta `0029_import_order.sql`. Mi memoria de esta conversación tiene registrado que ya aplicaste una **migración 0030** en producción (fix de recursión RLS en `profiles`, función `current_profile_role()`) que no está en este zip — probablemente se aplicó directo en el SQL editor de Supabase sin commitear el archivo.

Antes de que te arme el `.sql`, decime: **¿tu repo real ya tiene un archivo `0030_...sql`?** Si sí, esta migración nueva sería `0031`; si no, la numero `0030` yo mismo con el contenido de esa fix + Fase 8 junto, o por separado — como prefieras.

## 6. Qué pasa una vez aprobado esto

Con esto aprobado, el siguiente paso es un único script de **seed** (`insert` puro, no migración de esquema) que carga:
- Las 3 marcas.
- Los ~78 productos del catálogo (Panino + Nino) con `brand_id` correcto.
- Los insumos y costos de las 2 recetas que confirmaste (Lomo Grande, Lomo Mediano) + las 3 derivadas directas (Lomo mediano + fritas, y las que vos termines de confirmar de la familia lomo).
- El resto de los productos quedan cargados sin receta (fallback a costo manual) hasta que me pases los insumos.

¿Aprobás este modelo tal cual, o hay algo que ajustar antes de que escriba la migración?

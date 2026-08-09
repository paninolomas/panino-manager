-- 0036_royalty_and_product_profitability_calculator.sql
-- "quiero saber la rentabilidad y el margen de venta de cada producto, no
-- importa cuando lo vendí" -- el módulo de Rentabilidad actual (0025) solo
-- calcula margen sobre VENTAS REALES de un período (sales_summary_by_product_channel).
-- Esto es un cálculo distinto y más simple: a partir del precio vigente por
-- canal + costo actual (de la receta) + comisión del canal + regalía de
-- marca, sin necesitar ninguna venta cargada. Coexiste con lo anterior, no
-- lo reemplaza (decisión explícita: "veamos cómo queda esta primero").
--
-- De paso cierra dos huecos reales encontrados:
--   1. No existía ningún concepto de "regalía de marca" en el sistema.
--   2. channel_cost_items (comisión por canal) nunca tuvo una forma de
--      editarse desde la app -- comparando con la planilla real del usuario
--      (35% para PedidosYa) contra el placeholder cargado en 0019 (20%),
--      quedó claro que hace falta poder corregirlo sin entrar a SQL cada vez.

-- ========== 1. Regalía de marca (global, versionada) ==========
-- "Se aplica a todo (Panino, Nino y Goat)" -- confirmado por el usuario, por
-- eso es una sola tasa por ubicación, no por marca/canal.

create table if not exists royalty_rates (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  percent numeric(6,4) not null check (percent >= 0 and percent <= 1),
  valid_from date not null default current_date,
  valid_to date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_royalty_rate_per_location
  on royalty_rates (location_id)
  where valid_to is null;

alter table royalty_rates enable row level security;
create policy "royalty_rates select" on royalty_rates for select
  using (has_permission('expenses', false) and location_id = current_profile_location());
create policy "royalty_rates write" on royalty_rates for all
  using (has_permission('expenses', true) and location_id = current_profile_location())
  with check (has_permission('expenses', true) and location_id = current_profile_location() and created_by = auth.uid());

create or replace function set_royalty_rate(p_percent numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para modificar la regalía';
  end if;
  if p_percent < 0 or p_percent > 1 then
    raise exception 'El porcentaje de regalía debe estar entre 0 y 1';
  end if;

  update royalty_rates
    set valid_to = current_date
  where location_id = current_profile_location() and valid_to is null;

  insert into royalty_rates (location_id, percent, valid_from, created_by)
  values (current_profile_location(), p_percent, current_date, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function set_royalty_rate(numeric) to authenticated;

-- ========== 2. Editar comisión de canal (mismo patrón que set_channel_price, 0024) ==========

create or replace function set_channel_commission(p_channel_id uuid, p_percent numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para modificar comisiones';
  end if;
  if p_percent < 0 or p_percent > 1 then
    raise exception 'La comisión debe estar entre 0 y 1';
  end if;
  if not exists (select 1 from channels where id = p_channel_id) then
    raise exception 'Canal inválido';
  end if;

  update channel_cost_items
    set valid_to = current_date
  where channel_id = p_channel_id and type = 'commission' and valid_to is null;

  insert into channel_cost_items (channel_id, type, value_percent, valid_from)
  values (p_channel_id, 'commission', p_percent, current_date)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function set_channel_commission(uuid, numeric) to authenticated;

-- ========== 3. Vista de solo lectura para el calculador (precio + costo + comisión, un producto x canal por fila) ==========
-- El cálculo en sí (comisión $, regalía $, total obtenido, rentabilidad %)
-- lo hace profitability-engine.ts en TypeScript puro -- esto solo junta las
-- columnas, mismo principio que sales_summary_by_product_channel (0025).

create or replace function product_profitability_inputs()
returns table (
  product_id uuid,
  product_name text,
  channel_id uuid,
  channel_name text,
  price numeric,
  cost numeric,
  commission_percent numeric
)
language sql
stable
security definer set search_path = public
as $$
  select
    p.id,
    p.name,
    c.id,
    c.name,
    cp.price,
    p.current_cost,
    coalesce(cci.value_percent, 0)
  from channel_prices cp
  join products p on p.id = cp.product_id
  join channels c on c.id = cp.channel_id
  left join channel_cost_items cci on cci.channel_id = c.id and cci.type = 'commission' and cci.valid_to is null
  where cp.valid_to is null
    and p.location_id = current_profile_location()
    and p.active = true
    and has_permission('expenses', false)
  order by p.name, c.name;
$$;

comment on function product_profitability_inputs() is
  'Un producto x canal por fila, con precio vigente + costo actual + comisión vigente del canal. La regalía NO viene de acá (es una sola tasa global, se lee aparte con getActiveRoyaltyRate) -- profitability-engine.ts combina todo.';

grant execute on function product_profitability_inputs() to authenticated;

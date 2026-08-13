-- 0043_daily_sales_closings.sql
-- Fase 20: cierre rápido diario (pedidos + monto bruto) para alimentar el
-- motor de Objetivos sin necesidad de cargar cada venta en `orders` ni
-- discriminar por producto/canal. Convive con la carga detallada -- ver
-- comentario en daily_sales_series más abajo para la regla de prioridad
-- (detalle de `orders` gana por día si existe, el cierre solo llena huecos).
-- NO genera movimiento de caja, comisión ni liquidación -- eso sigue
-- requiriendo "Registrar venta" (orders) o Cajas, y tampoco alimenta
-- Rentabilidad (que sigue necesitando detalle por producto). Decisión
-- confirmada con el usuario: este cierre es solo para no perder el
-- objetivo semanal los días que no hay tiempo de cargar el detalle.

create table if not exists daily_sales_closings (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  sale_date date not null,
  order_count integer not null check (order_count >= 0),
  revenue numeric(14,2) not null check (revenue >= 0),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, sale_date)
);

alter table daily_sales_closings enable row level security;
create policy "daily_sales_closings select" on daily_sales_closings for select
  using (has_permission('sales', false) and location_id = current_profile_location());
-- La escritura ocurre vía RPC (upsert_daily_sales_closing) para poder hacer
-- upsert (insert-o-update, "si ya cargaste hoy, pisa el valor") con una sola
-- llamada desde el cliente -- mismo motivo que record_sale usa RPC en vez
-- de insert directo.

create or replace function upsert_daily_sales_closing(
  p_sale_date date, p_order_count integer, p_revenue numeric
) returns daily_sales_closings
language plpgsql security definer set search_path = public
as $$
declare
  v_row daily_sales_closings;
begin
  if not has_permission('sales', true) then
    raise exception 'Sin permiso para cargar el cierre de ventas';
  end if;

  if p_sale_date is null then
    raise exception 'Falta la fecha';
  end if;
  if p_order_count is null or p_order_count < 0 then
    raise exception 'Cantidad de pedidos inválida';
  end if;
  if p_revenue is null or p_revenue < 0 then
    raise exception 'Monto inválido';
  end if;

  insert into daily_sales_closings (location_id, sale_date, order_count, revenue, created_by)
  values (current_profile_location(), p_sale_date, p_order_count, p_revenue, auth.uid())
  on conflict (location_id, sale_date)
  do update set order_count = excluded.order_count, revenue = excluded.revenue, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function upsert_daily_sales_closing(date, integer, numeric) to authenticated;

-- Reemplaza daily_sales_series (0028): ahora combina orders (detalle, tiene
-- prioridad) con daily_sales_closings (cierre rápido, solo llena los días
-- que orders no cubre para esa fecha). Mismo signature de retorno -- no
-- rompe a quien la llama (goals.repo.ts / getGoalAchievedValue).
create or replace function daily_sales_series(p_from date, p_to date)
returns table (date date, revenue numeric, orders_count bigint)
language sql
stable
security definer set search_path = public
as $$
  with detailed as (
    select
      o.order_datetime::date as d,
      sum(o.total) as revenue,
      count(*) as orders_count
    from orders o
    where o.location_id = current_profile_location()
      and has_permission('movements', false)
      and o.order_datetime::date between p_from and p_to
    group by o.order_datetime::date
  ),
  closings as (
    select
      c.sale_date as d,
      c.revenue,
      c.order_count::bigint as orders_count
    from daily_sales_closings c
    where c.location_id = current_profile_location()
      and has_permission('movements', false)
      and c.sale_date between p_from and p_to
      and c.sale_date not in (select d from detailed)
  )
  select d as date, revenue, orders_count from detailed
  union all
  select d as date, revenue, orders_count from closings
  order by date;
$$;

grant execute on function daily_sales_series(date, date) to authenticated;

comment on function daily_sales_series(date, date) is
  'Fase 20: por día, prioriza el detalle de orders (más preciso, viene de "Registrar venta"); si ese día no tiene orders cargados, usa el cierre rápido de daily_sales_closings. Nunca se suman entre sí (evita doble conteo).';

-- Recordatorio: correr manualmente en el SQL Editor después de aplicar esta
-- migración -> NOTIFY pgrst, 'reload schema';

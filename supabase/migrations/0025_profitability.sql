-- 0025_profitability.sql
-- Fase 3. La agregación (unidades vendidas, ingreso bruto) es lo único que
-- resuelve SQL -- el cálculo de margen en sí (precio neto, ganancia, %) lo
-- hace lib/services/profitability-engine.ts en el servidor de Next.js, nunca
-- en SQL ni en el Copiloto (Sección 27 del prompt original).

create table if not exists margin_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  product_id uuid not null references products(id),
  channel_id uuid not null references channels(id),
  period_start date not null,
  period_end date not null,
  units_sold numeric(10,2) not null,
  unit_price numeric(14,2) not null,
  unit_cost numeric(14,2) not null,
  unit_profit numeric(14,2) not null,
  margin_percent numeric(7,4) not null,
  total_profit numeric(14,2) not null,
  total_contribution numeric(14,2) not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

comment on table margin_snapshots is
  'Historial de margen por producto/canal/período. Se genera explícitamente (botón "recalcular"), no automáticamente -- así queda claro qué período se está mirando y permite comparar contra el snapshot anterior para detectar caídas (Sección 13 del prompt original).';

create index if not exists idx_margin_snapshots_product_channel on margin_snapshots (product_id, channel_id, period_end desc);

alter table margin_snapshots enable row level security;
create policy "margin_snapshots select" on margin_snapshots for select
  using (has_permission('expenses', false) and location_id = current_profile_location());
create policy "margin_snapshots insert" on margin_snapshots for insert
  with check (has_permission('expenses', true) and location_id = current_profile_location() and created_by = auth.uid());

-- ---------- agregación de ventas por producto/canal en un período (solo lectura) ----------
create or replace function sales_summary_by_product_channel(p_period_start date, p_period_end date)
returns table (product_id uuid, channel_id uuid, units_sold numeric, gross_revenue numeric)
language sql
stable
security definer set search_path = public
as $$
  select
    oi.product_id,
    o.channel_id,
    sum(oi.quantity) as units_sold,
    sum(oi.quantity * oi.unit_price) as gross_revenue
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.location_id = current_profile_location()
    and has_permission('expenses', false)
    and o.order_datetime::date between p_period_start and p_period_end
  group by oi.product_id, o.channel_id;
$$;

comment on function sales_summary_by_product_channel(date, date) is
  'Fase 3: única fuente de "unidades vendidas" e "ingreso bruto" para el motor de rentabilidad. No calcula margen -- eso lo hace profitability-engine.ts con este resultado + costo actual + comisión del canal.';

-- ---------- persistir los snapshots ya calculados por el motor TS ----------
create or replace function insert_margin_snapshots(p_period_start date, p_period_end date, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_count integer := 0;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para guardar rentabilidad';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into margin_snapshots (
      location_id, product_id, channel_id, period_start, period_end,
      units_sold, unit_price, unit_cost, unit_profit, margin_percent,
      total_profit, total_contribution, created_by
    ) values (
      current_profile_location(),
      (v_row->>'productId')::uuid,
      (v_row->>'channelId')::uuid,
      p_period_start,
      p_period_end,
      (v_row->>'unitsSold')::numeric,
      (v_row->>'unitPrice')::numeric,
      (v_row->>'unitCost')::numeric,
      (v_row->>'unitProfit')::numeric,
      (v_row->>'marginPercent')::numeric,
      (v_row->>'totalProfit')::numeric,
      (v_row->>'totalContribution')::numeric,
      auth.uid()
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function sales_summary_by_product_channel(date, date) to authenticated;
grant execute on function insert_margin_snapshots(date, date, jsonb) to authenticated;

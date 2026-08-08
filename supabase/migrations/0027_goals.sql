-- 0027_goals.sql
-- Fase 5. Sin RPC transaccional -- a diferencia de cash_movements, un
-- objetivo no mueve dinero ni tiene riesgo de doble escritura concurrente,
-- así que un INSERT directo protegido por RLS alcanza (mismo criterio que
-- suppliers/expenses en Fase 1).

create type goal_type as enum ('weekly', 'monthly', 'annual');
create type goal_variable as enum (
  'facturacion', 'ganancia', 'pedidos', 'ticket_promedio', 'margen', 'caja', 'ahorro'
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  type goal_type not null,
  variable goal_variable not null,
  target_value numeric(14,2) not null check (target_value > 0),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

comment on table goals is
  'Objetivos financieros/operativos por período. El valor "logrado" se calcula en tiempo real desde los datos reales (orders, cash_movements, margin_snapshots según la variable) -- no se guarda acá, para no tener que mantenerlo sincronizado.';

create index if not exists idx_goals_period on goals (location_id, period_start, period_end);

alter table goals enable row level security;
create policy "goals select" on goals for select
  using (has_permission('movements', false) and location_id = current_profile_location());
create policy "goals insert" on goals for insert
  with check (has_permission('movements', true) and location_id = current_profile_location() and created_by = auth.uid());

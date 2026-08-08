-- 0017_advance_simulations.sql
-- Fase 2. Registro de cada simulación/decisión de adelanto de PedidosYa
-- (Sección B del addendum v2 -- entidad AdvanceSimulation). No es una tabla
-- de configuración con 3%+IVA fijo: cada fila guarda los parámetros que se
-- usaron en ESA simulación puntual, editable caso a caso.

create table if not exists advance_simulations (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid references settlements(id),
  net_receivable numeric(14,2) not null check (net_receivable > 0),
  normal_payment_date date not null,
  advance_date date not null,
  advance_fee_percent numeric(6,4) not null check (advance_fee_percent >= 0),
  vat_percent numeric(6,4) not null default 0.21 check (vat_percent >= 0),
  advance_cost numeric(14,2) not null,
  net_if_advance numeric(14,2) not null,
  decision text not null check (decision in ('advance', 'wait')),
  reason text not null,
  projected_available_before_normal_date numeric(14,2) not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

comment on table advance_simulations is
  'Historial de simulaciones/decisiones de adelanto de PedidosYa. Cada fila documenta con qué parámetros y con qué justificación se decidió adelantar o esperar -- transparencia de la recomendación (Sección 43 del prompt original).';

alter table advance_simulations enable row level security;
create policy "advance_simulations select" on advance_simulations for select
  using (has_permission('movements', false));
create policy "advance_simulations insert" on advance_simulations for insert
  with check (has_permission('movements', true) and created_by = auth.uid());

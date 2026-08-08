-- 0010_rls_policies.sql
-- RLS es la capa real de seguridad (no la UI). Patrón único en toda la base:
-- auth.uid() -> profiles.role/location_id -> role_permissions -> autorización.

create or replace function current_profile_location()
returns uuid
language sql stable
security definer set search_path = public
as $$
  select location_id from profiles where id = auth.uid();
$$;

create or replace function has_permission(p_module text, p_write boolean default false)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from profiles p
    join role_permissions rp on rp.role = p.role
    where p.id = auth.uid()
      and p.active = true
      and rp.module = p_module
      and (case when p_write then rp.can_write else rp.can_read end) = true
  );
$$;

-- ===== profiles =====
alter table profiles enable row level security;
create policy "usuario ve su propio profile" on profiles for select
  using (id = auth.uid());
create policy "socio ve profiles de su ubicación" on profiles for select
  using (exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'socio' and me.location_id = profiles.location_id));
create policy "usuario crea su propio profile (alta inicial)" on profiles for insert
  with check (id = auth.uid());

-- ===== role_permissions ===== (solo lectura para todos los autenticados, escritura nunca desde cliente)
alter table role_permissions enable row level security;
create policy "cualquier autenticado lee role_permissions" on role_permissions for select
  using (auth.role() = 'authenticated');

-- ===== locations =====
alter table locations enable row level security;
create policy "usuario ve su propia location" on locations for select
  using (id = current_profile_location());

-- ===== cash_accounts =====
alter table cash_accounts enable row level security;
create policy "accounts select" on cash_accounts for select
  using (has_permission('accounts', false) and location_id = current_profile_location());
create policy "accounts insert" on cash_accounts for insert
  with check (has_permission('accounts', true) and location_id = current_profile_location());
create policy "accounts update" on cash_accounts for update
  using (has_permission('accounts', true) and location_id = current_profile_location());

-- ===== cash_movements ===== INSERT-ONLY: sin policy de update/delete -> quedan bloqueados.
alter table cash_movements enable row level security;
create policy "movements select" on cash_movements for select
  using (
    has_permission('movements', false)
    and exists (select 1 from cash_accounts a where a.id = cash_movements.account_id and a.location_id = current_profile_location())
  );
-- No se crea policy de INSERT para el rol authenticated: toda escritura pasa por
-- las funciones RPC de 0011, que son security definer y no dependen de una policy de insert.
revoke insert, update, delete on cash_movements from authenticated;
grant select on cash_movements to authenticated;

-- ===== suppliers =====
alter table suppliers enable row level security;
create policy "suppliers select" on suppliers for select
  using (has_permission('suppliers', false) and location_id = current_profile_location());
create policy "suppliers insert" on suppliers for insert
  with check (has_permission('suppliers', true) and location_id = current_profile_location());
create policy "suppliers update" on suppliers for update
  using (has_permission('suppliers', true) and location_id = current_profile_location());

-- ===== obligations ===== (visibilidad ligada a suppliers.location_id vía join; escritura = módulo movements/suppliers con write)
alter table obligations enable row level security;
create policy "obligations select" on obligations for select
  using (
    has_permission('suppliers', false)
    and exists (select 1 from suppliers s where s.id = obligations.supplier_id and s.location_id = current_profile_location())
  );
create policy "obligations insert" on obligations for insert
  with check (
    has_permission('suppliers', true)
    and exists (select 1 from suppliers s where s.id = obligations.supplier_id and s.location_id = current_profile_location())
  );
create policy "obligations update metadata" on obligations for update
  using (
    has_permission('suppliers', true)
    and exists (select 1 from suppliers s where s.id = obligations.supplier_id and s.location_id = current_profile_location())
  );
-- pagar una obligación (status -> paid, paid_movement_id) se hace vía RPC pay_obligation (0011).

-- ===== expense_categories / recurring_expense_templates ===== (sin location_id: catálogo compartido, solo socio escribe)
alter table expense_categories enable row level security;
create policy "categories select" on expense_categories for select using (auth.role() = 'authenticated');
create policy "categories write" on expense_categories for all
  using (has_permission('expenses', true)) with check (has_permission('expenses', true));

alter table recurring_expense_templates enable row level security;
create policy "recurring select" on recurring_expense_templates for select using (has_permission('expenses', false));
create policy "recurring write" on recurring_expense_templates for all
  using (has_permission('expenses', true)) with check (has_permission('expenses', true));

-- ===== expenses ===== (empleado NO tiene fila en role_permissions para 'expenses' -> no ve montos)
alter table expenses enable row level security;
create policy "expenses select" on expenses for select
  using (has_permission('expenses', false) and location_id = current_profile_location());
create policy "expenses insert" on expenses for insert
  with check (has_permission('expenses', true) and location_id = current_profile_location());
create policy "expenses update metadata" on expenses for update
  using (has_permission('expenses', true) and location_id = current_profile_location());

-- ===== channels / channel_settlement_rules / channel_cost_items ===== (catálogo, socio administra)
alter table channels enable row level security;
create policy "channels select" on channels for select using (auth.role() = 'authenticated');

alter table channel_settlement_rules enable row level security;
create policy "settlement_rules select" on channel_settlement_rules for select using (auth.role() = 'authenticated');
create policy "settlement_rules write" on channel_settlement_rules for all
  using (has_permission('channels', true)) with check (has_permission('channels', true));

alter table channel_cost_items enable row level security;
create policy "cost_items select" on channel_cost_items for select using (auth.role() = 'authenticated');
create policy "cost_items write" on channel_cost_items for all
  using (has_permission('channels', true)) with check (has_permission('channels', true));

-- ===== products / channel_prices ===== (empleado no tiene módulo 'products' en Fase 1 -> sin acceso a costos)
alter table products enable row level security;
create policy "products select" on products for select
  using (has_permission('expenses', false) and location_id = current_profile_location()); -- reutiliza permiso financiero: costo de producto es dato sensible
create policy "products write" on products for all
  using (has_permission('expenses', true) and location_id = current_profile_location())
  with check (has_permission('expenses', true) and location_id = current_profile_location());

alter table channel_prices enable row level security;
create policy "channel_prices select" on channel_prices for select using (has_permission('expenses', false));
create policy "channel_prices write" on channel_prices for all
  using (has_permission('expenses', true)) with check (has_permission('expenses', true));

-- ===== settlements / commission_charges ===== (financiero -> solo socio)
alter table settlements enable row level security;
create policy "settlements select" on settlements for select using (has_permission('movements', false));
alter table commission_charges enable row level security;
create policy "commission_charges select" on commission_charges for select using (has_permission('movements', false));
-- Escritura de estas dos tablas ocurre vía RPC (collect_settlement, pay_commission) en Fase 2 -- Fase 1 no genera filas todavía.

-- ===== orders / order_items ===== (empleado SÍ tiene módulo 'sales': puede registrar ventas, no ve costos de producto)
alter table orders enable row level security;
create policy "orders select" on orders for select
  using (has_permission('sales', false) and location_id = current_profile_location());
create policy "orders insert" on orders for insert
  with check (has_permission('sales', true) and location_id = current_profile_location());

alter table order_items enable row level security;
create policy "order_items select" on order_items for select
  using (exists (select 1 from orders o where o.id = order_items.order_id and has_permission('sales', false) and o.location_id = current_profile_location()));
create policy "order_items insert" on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_items.order_id and has_permission('sales', true) and o.location_id = current_profile_location()));

-- ===== reserve_targets / withdrawals ===== (financiero sensible -> solo socio, vía módulo movements)
alter table reserve_targets enable row level security;
create policy "reserve select" on reserve_targets for select
  using (has_permission('movements', false) and location_id = current_profile_location());
create policy "reserve write" on reserve_targets for all
  using (has_permission('movements', true) and location_id = current_profile_location())
  with check (has_permission('movements', true) and location_id = current_profile_location());

alter table withdrawals enable row level security;
create policy "withdrawals select" on withdrawals for select using (has_permission('movements', false));
-- insert de withdrawals ocurre vía RPC withdraw() (0011).

-- ===== import_batches / column_mapping_templates ===== (sin uso funcional en Fase 1, solo socio lee/escribe)
alter table import_batches enable row level security;
create policy "import_batches all" on import_batches for all
  using (has_permission('channels', true)) with check (has_permission('channels', true));
alter table column_mapping_templates enable row level security;
create policy "mapping_templates all" on column_mapping_templates for all
  using (has_permission('channels', true)) with check (has_permission('channels', true));

-- ===== audit_log ===== (solo lectura para quien tiene permiso 'audit' -- socio en Fase 1)
alter table audit_log enable row level security;
create policy "audit select" on audit_log for select using (has_permission('audit', false));
revoke insert, update, delete on audit_log from authenticated; -- solo el trigger (security definer) escribe acá

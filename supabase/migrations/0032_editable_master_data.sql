-- 0032_editable_master_data.sql
-- Fase 9: cierra el gap real encontrado al auditar la app -- ningún módulo
-- tenía edición ni borrado en la UI/API, más allá de un puñado de acciones
-- puntuales (pay, collect, cost). Esta migración solo agrega lo que
-- efectivamente faltaba a nivel de esquema/RLS -- la mayoría de las tablas
-- (cash_accounts, suppliers, obligations, expenses, expense_categories,
-- products, stock_items) YA tenían policy de update desde 0010/0026, el
-- gap estaba en la capa de API/UI, no acá.

-- ---------- 1. suppliers: no tenía columna 'active' para desactivar ----------
-- (no se permite DELETE real -- obligations referencia supplier_id por FK)

alter table suppliers add column if not exists active boolean not null default true;

-- ---------- 2. expense_categories: mismo caso ----------
-- (no se permite DELETE real -- expenses referencia category_id por FK)

alter table expense_categories add column if not exists active boolean not null default true;

-- ---------- 3. goals: no tenía policy de update NI de delete ----------
-- A diferencia del resto, un objetivo no tiene ninguna tabla que lo
-- referencie por FK -- se permite DELETE real, no solo desactivar.

create policy "goals update" on goals for update
  using (has_permission('movements', true) and location_id = current_profile_location());
create policy "goals delete" on goals for delete
  using (has_permission('movements', true) and location_id = current_profile_location());

-- ---------- 4. listSuppliers/listExpenseCategories: filtrar inactivos ----------
-- (nota para la capa de repos, no del schema: los repos que listan estas dos
-- tablas deben agregar .eq("active", true), mismo criterio que ya usan
-- listAccounts/listProducts/listStockItems)

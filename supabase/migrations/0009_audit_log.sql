-- 0009_audit_log.sql

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists idx_audit_log_record on audit_log (table_name, record_id);

-- Trigger genérico reutilizable para las tablas sensibles (Sección 42 del prompt maestro):
-- costos, precios, gastos, proveedores, movimientos, retiros, reglas de cobro, reservas.
create or replace function audit_row_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  col text;
  old_val text;
  new_val text;
begin
  for col in select jsonb_object_keys(to_jsonb(new)) loop
    execute format('select ($1).%I::text', col) using old into old_val;
    execute format('select ($1).%I::text', col) using new into new_val;
    if old_val is distinct from new_val then
      insert into audit_log (table_name, record_id, field, old_value, new_value, changed_by)
      values (tg_table_name, (to_jsonb(new)->>'id')::uuid, col, old_val, new_val, auth.uid());
    end if;
  end loop;
  return new;
end;
$$;

-- Aplicado a las tablas donde ya permitimos UPDATE (no a cash_movements, que es insert-only).
create trigger trg_audit_products after update on products
  for each row execute function audit_row_change();
create trigger trg_audit_channel_prices after update on channel_prices
  for each row execute function audit_row_change();
create trigger trg_audit_expenses after update on expenses
  for each row execute function audit_row_change();
create trigger trg_audit_suppliers after update on suppliers
  for each row execute function audit_row_change();
create trigger trg_audit_obligations after update on obligations
  for each row execute function audit_row_change();
create trigger trg_audit_channel_settlement_rules after update on channel_settlement_rules
  for each row execute function audit_row_change();
create trigger trg_audit_reserve_targets after update on reserve_targets
  for each row execute function audit_row_change();

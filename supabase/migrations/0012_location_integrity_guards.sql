-- 0012_location_integrity_guards.sql
-- Fase 1.1 — hardening, item 5 y parte del item 4.
-- No se editan migraciones ya aplicadas: esto agrega columnas/triggers nuevos.

-- Los canales pueden deshabilitarse sin borrarlos (ej. si Panino deja de operar
-- con WhatsApp). record_sale (0014) valida esto.
alter table channels add column if not exists active boolean not null default true;

-- expenses.supplier_id -> suppliers.location_id debe coincidir con expenses.location_id.
-- Antes solo se validaba "el proveedor existe", no que fuera de la misma ubicación.
create or replace function guard_expense_supplier_location()
returns trigger language plpgsql as $$
declare
  v_supplier_location uuid;
begin
  if new.supplier_id is not null then
    select location_id into v_supplier_location from suppliers where id = new.supplier_id;
    if v_supplier_location is null then
      raise exception 'Proveedor inválido';
    end if;
    if v_supplier_location <> new.location_id then
      raise exception 'El proveedor % no pertenece a la misma ubicación que el gasto', new.supplier_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_expense_supplier_location on expenses;
create trigger trg_expense_supplier_location
  before insert or update on expenses
  for each row execute function guard_expense_supplier_location();

comment on function guard_expense_supplier_location() is
  'Fase 1.1 item 5: evita que un gasto quede asociado a un proveedor de otra ubicación. obligations no necesita un guard equivalente porque no tiene location_id propio -- la hereda de supplier_id, y la policy RLS de insert de obligations ya exige supplier.location_id = current_profile_location().';

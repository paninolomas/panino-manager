-- 0013_sales_products_secure_function.sql
-- Fase 1.1 item 1.
--
-- Problema: RLS es por FILA, no por columna. Como socio y empleado son el mismo
-- rol de Postgres ("authenticated"), no se puede usar GRANT column-level para
-- diferenciarlos -- ambos comparten el mismo rol de base de datos. La única
-- forma limpia de exponer "nombre sí, costo no" según el usuario autenticado es
-- una función security definer que decide qué columnas devolver.
--
-- products (la tabla) sigue restringida a quien tenga permiso de 'expenses'
-- (socio) -- sin cambios en su RLS. Esta función es la única vía por la que
-- un empleado puede "ver" productos, y solo ve columnas no sensibles.

create or replace function sales_products()
returns table (id uuid, name text, category text, active boolean)
language sql
stable
security definer set search_path = public
as $$
  select p.id, p.name, p.category, p.active
  from products p
  where p.active = true
    and p.location_id = current_profile_location()
    and has_permission('sales', false);
$$;

comment on function sales_products() is
  'Fase 1.1 item 1: fuente segura de productos para el flujo de ventas. Nunca expone current_cost. Devuelve vacío si el usuario no tiene permiso de lectura sobre el módulo sales.';

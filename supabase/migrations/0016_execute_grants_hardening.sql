-- 0016_execute_grants_hardening.sql
-- Fase 1.1 item 7.
--
-- 0011 otorgaba "grant execute on all functions in schema public to authenticated",
-- lo cual expone automáticamente cualquier función nueva a todo usuario
-- autenticado apenas se crea, sin decisión explícita. Se reemplaza por el
-- principio de mínimo privilegio: cada función que el cliente puede invocar
-- se lista a mano acá. Las funciones internas (triggers, helpers invocados
-- solo desde dentro de otras funciones/policies) no reciben grant directo.

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from authenticated;

-- Salvedad necesaria: gen_random_uuid() (de pgcrypto) puede vivir en el schema
-- public según cómo se instaló la extensión en 0001, y se usa en el DEFAULT de
-- la columna id de casi todas las tablas (ej. cash_accounts, suppliers,
-- products). Esos INSERT directos corren como rol "authenticated" (no como
-- superusuario), así que si no se re-otorga esto, cualquier alta directa
-- (crear cuenta, crear proveedor, etc.) rompe. No es una función de negocio,
-- es una utilidad de extensión -- el "mínimo privilegio" del item 7 aplica a
-- nuestras funciones de negocio, no a esto. Se re-otorga condicionalmente: si
-- pgcrypto quedó instalada en otro schema (ej. "extensions", el default más
-- reciente de Supabase), el revoke de arriba nunca la tocó y este bloque no
-- hace nada.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'gen_random_uuid' and n.nspname = 'public'
  ) then
    execute 'grant execute on function public.gen_random_uuid() to public';
  end if;
end $$;

-- Helpers de solo lectura, invocados por las RLS policies en el contexto del
-- usuario autenticado (no son security definer de escritura, no exponen nada
-- que el usuario no pueda ya inferir de su propia sesión).
grant execute on function current_profile_location() to authenticated;
grant execute on function has_permission(text, boolean) to authenticated;

-- Lectura segura de productos para ventas (0013).
grant execute on function sales_products() to authenticated;

-- RPC financieras de escritura (0011, con cuerpos actualizados en 0014).
-- Cada una valida permiso + location_id internamente -- este grant solo dice
-- "un usuario autenticado puede intentar llamarla", no "puede completarla".
grant execute on function create_opening_balance(uuid, numeric, movement_direction, date, text) to authenticated;
grant execute on function pay_obligation(uuid, uuid, date, text) to authenticated;
grant execute on function pay_expense(uuid, uuid, date, text) to authenticated;
grant execute on function transfer_between_accounts(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function create_manual_movement(uuid, numeric, movement_direction, date, text) to authenticated;
grant execute on function reverse_movement(uuid, text) to authenticated;
grant execute on function record_withdrawal(uuid, numeric, date, approval_signal, text) to authenticated;
grant execute on function record_sale(uuid, text, jsonb, text) to authenticated;

-- NO reciben grant a authenticated (uso exclusivamente interno):
--   handle_new_user()            -- se ejecuta como trigger de auth.users, no vía RPC del cliente
--   audit_row_change()           -- trigger interno de auditoría
--   guard_obligation_immutability(), guard_expense_immutability(),
--   guard_expense_supplier_location()  -- triggers de integridad, no funciones invocables
-- Si en el futuro alguna de estas necesitara ser invocable directamente,
-- agregar el grant acá con su propia justificación -- no reactivar el grant amplio.

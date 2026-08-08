-- seed.sql
-- Se ejecuta automáticamente después de las migraciones con `supabase db reset`.
-- Los usuarios (socios/empleados) NO se crean acá: se crean vía Supabase Auth
-- (Studio local o `supabase auth` / signup), y el trigger de 0002 genera su
-- `profile` automáticamente. Ver README para el paso a paso.

insert into locations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Panino')
on conflict (id) do nothing;

-- Cuentas base sugeridas (el socio puede editarlas/agregar otras desde la UI)
insert into cash_accounts (location_id, name, type)
select '00000000-0000-0000-0000-000000000001', v.name, v.type::account_type
from (values
  ('Efectivo', 'efectivo'),
  ('Cuenta bancaria', 'banco'),
  ('Mercado Pago', 'mercado_pago')
) as v(name, type)
where not exists (
  select 1 from cash_accounts where location_id = '00000000-0000-0000-0000-000000000001' and name = v.name
);

-- 0003_role_permissions.sql
-- Permisos por módulo, consultados por las policies de RLS.
-- Agregar un módulo o cambiar un permiso es una fila, no una migración de política.

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role user_role not null,
  module text not null,
  can_read boolean not null default false,
  can_write boolean not null default false,
  unique (role, module)
);

comment on table role_permissions is 'Configuración de acceso por rol y módulo. Las policies de RLS consultan esta tabla en vez de tener el rol hardcodeado en cada policy.';

-- Módulos de Fase 1
insert into role_permissions (role, module, can_read, can_write) values
  ('socio', 'accounts', true, true),
  ('socio', 'movements', true, true),
  ('socio', 'suppliers', true, true),
  ('socio', 'expenses', true, true),
  ('socio', 'sales', true, true),
  ('socio', 'audit', true, false),
  ('socio', 'channels', true, true),
  ('empleado', 'suppliers', true, false),
  ('empleado', 'sales', true, true)
on conflict (role, module) do nothing;

comment on column role_permissions.module is 'Ej: accounts, movements, suppliers, expenses, sales, audit, channels. El empleado NO tiene fila para accounts/movements/expenses/audit -> no existe para RLS, no es que la UI se lo oculte.';

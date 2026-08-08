-- 0002_profiles_and_roles.sql
-- profiles extiende auth.users (Supabase no permite agregar columnas propias
-- directamente a auth.users). role vive acá, no en el frontend.

create type user_role as enum ('socio', 'empleado');

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  location_id uuid not null references locations(id),
  full_name text not null,
  role user_role not null default 'empleado',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table profiles is 'Espejo 1:1 de auth.users con datos de negocio (rol, ubicación). Fuente de verdad de permisos junto con role_permissions.';

-- Trigger: crea automáticamente el profile cuando se registra un usuario en auth.users.
-- Corre con privilegios de definer DENTRO de la base -- no requiere SUPABASE_SERVICE_ROLE_KEY
-- desde la aplicación. El location_id y full_name se pasan en user_metadata al invitar/crear
-- al usuario (flujo administrado por un socio, no self-signup público).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, location_id, full_name, role)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'location_id')::uuid, (select id from locations limit 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'empleado')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

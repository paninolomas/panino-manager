-- 0015_signup_role_hardening.sql
-- Fase 1.1 item 9.
--
-- Problema: handle_new_user() (0002) confiaba en raw_user_meta_data->>'role' y
-- ->>'location_id'. En un proyecto Supabase con signup público habilitado,
-- cualquiera puede pasar user_metadata al registrarse (es un parámetro normal
-- del SDK de Auth) -- eso permitía autoproclamarse 'socio' con acceso
-- financiero completo con solo crear una cuenta.
--
-- Fix: el trigger ya NO confía en el rol ni en la ubicación declarados por el
-- propio usuario. Todo usuario nuevo entra como 'empleado' de la única
-- ubicación existente (Panino, MVP single-location). Promover a 'socio' es
-- una acción administrativa deliberada: se hace actualizando profiles.role
-- directamente (Supabase Studio o SQL con un usuario con acceso a la base),
-- nunca desde la aplicación -- no existe policy de UPDATE sobre profiles.role
-- para el propio usuario (ver 0010: profiles solo tiene policies de SELECT e
-- INSERT, ninguna de UPDATE).
--
-- full_name sigue tomándose de metadata: no es un dato sensible de permisos.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, location_id, full_name, role)
  values (
    new.id,
    (select id from locations order by created_at limit 1),
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'empleado'
  );
  return new;
end;
$$;

comment on function handle_new_user() is
  'Fase 1.1 item 9: ignora deliberadamente role/location_id de user_metadata. Todo alta nueva es empleado de la única ubicación existente hasta que un socio la promueva manualmente en la base.';

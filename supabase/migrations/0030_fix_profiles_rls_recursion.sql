-- 0030_fix_profiles_rls_recursion.sql
-- Bug real encontrado corriendo contra un proyecto de Supabase real por
-- primera vez (todo lo anterior solo se había validado con tests estáticos
-- sobre el texto del SQL, nunca ejecutado). La policy "socio ve profiles de
-- su ubicación" (0010) subconsultaba la propia tabla `profiles` directamente
-- dentro de su USING -- Postgres, al evaluar esa policy, vuelve a aplicar
-- RLS sobre esa subconsulta, que dispara la misma policy de nuevo: ERROR
-- 42P17 infinite recursion detected in policy for relation "profiles".
--
-- Fix: el chequeo de rol pasa por una función security definer (mismo
-- patrón que current_profile_location()/has_permission()), cuya consulta
-- interna a profiles corre con privilegios elevados y no vuelve a evaluar
-- RLS -- corta el ciclo.
--
-- Nota: esta migración ya se corrió en producción vía SQL Editor cuando se
-- encontró el bug, pero nunca había quedado commiteada en el repo -- se
-- recupera acá desde el historial de la conversación donde se armó, para
-- que el repo vuelva a ser la fuente de verdad real de lo que hay en
-- producción. `create or replace` / `drop policy if exists` la hacen segura
-- de re-ejecutar aunque ya esté aplicada.

create or replace function current_profile_role()
returns user_role
language sql
stable
security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

drop policy if exists "socio ve profiles de su ubicación" on profiles;
create policy "socio ve profiles de su ubicación" on profiles for select
  using (
    current_profile_role() = 'socio'
    and location_id = current_profile_location()
  );

grant execute on function current_profile_role() to authenticated;

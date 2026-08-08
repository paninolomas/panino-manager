-- 0023_set_reserve_target.sql
-- Fase 2. reserve_targets ya tenía RLS de escritura directa (0010), pero
-- cambiar la reserva vigente requiere dos pasos (cerrar la anterior +
-- abrir la nueva) para respetar el índice único parcial "una vigente por
-- ubicación" (0008) -- si un cliente hace esos dos pasos por separado
-- puede quedar a mitad de camino. Se envuelve en una RPC atómica, mismo
-- criterio que el resto de las escrituras financieras.

create or replace function set_reserve_target(p_amount numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_permission('movements', true) then
    raise exception 'Sin permiso para modificar la reserva mínima';
  end if;
  if p_amount < 0 then
    raise exception 'La reserva no puede ser negativa';
  end if;

  update reserve_targets
    set valid_to = current_date
  where location_id = current_profile_location() and valid_to is null;

  insert into reserve_targets (location_id, amount, valid_from)
  values (current_profile_location(), p_amount, current_date)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function set_reserve_target(numeric) to authenticated;

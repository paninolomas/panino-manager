-- 0037_online_payment_fee.sql
-- "Servicio pago en línea" (PedidosYa, ~2,76% según ejemplos reales del
-- usuario) es un cargo distinto de la comisión y de los impuestos -- se
-- agrega como su propio tipo, no se mezcla con 'commission'. Impuestos
-- queda deliberadamente afuera (decisión del usuario: varía demasiado
-- pedido a pedido, prefiere completarlo a mano por fuera de la app).

-- ALTER TYPE ... ADD VALUE va solo en su propia sentencia -- Postgres no
-- permite usar un valor de enum recién agregado en la misma transacción
-- que lo crea. Si tu cliente SQL corre todo el archivo como una sola
-- transacción y esto falla, corré esta primera línea sola, aceptá, y
-- después el resto del archivo.
alter type channel_cost_type add value if not exists 'online_payment_fee';

create or replace function set_channel_online_payment_fee(p_channel_id uuid, p_percent numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para modificar cargos del canal';
  end if;
  if p_percent < 0 or p_percent > 1 then
    raise exception 'El porcentaje debe estar entre 0 y 1';
  end if;
  if not exists (select 1 from channels where id = p_channel_id) then
    raise exception 'Canal inválido';
  end if;

  update channel_cost_items
    set valid_to = current_date
  where channel_id = p_channel_id and type = 'online_payment_fee' and valid_to is null;

  insert into channel_cost_items (channel_id, type, value_percent, valid_from)
  values (p_channel_id, 'online_payment_fee', p_percent, current_date)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function set_channel_online_payment_fee(uuid, numeric) to authenticated;

-- product_profitability_inputs (0036) suma la columna de pago en línea --
-- reemplaza la función completa, no hay forma de "agregar una columna" a
-- un resultado de función sin recrearla.
create or replace function product_profitability_inputs()
returns table (
  product_id uuid,
  product_name text,
  channel_id uuid,
  channel_name text,
  price numeric,
  cost numeric,
  commission_percent numeric,
  online_payment_fee_percent numeric
)
language sql
stable
security definer set search_path = public
as $$
  select
    p.id,
    p.name,
    c.id,
    c.name,
    cp.price,
    p.current_cost,
    coalesce(cci_comm.value_percent, 0),
    coalesce(cci_fee.value_percent, 0)
  from channel_prices cp
  join products p on p.id = cp.product_id
  join channels c on c.id = cp.channel_id
  left join channel_cost_items cci_comm on cci_comm.channel_id = c.id and cci_comm.type = 'commission' and cci_comm.valid_to is null
  left join channel_cost_items cci_fee on cci_fee.channel_id = c.id and cci_fee.type = 'online_payment_fee' and cci_fee.valid_to is null
  where cp.valid_to is null
    and p.location_id = current_profile_location()
    and p.active = true
    and has_permission('expenses', false)
  order by p.name, c.name;
$$;

comment on function product_profitability_inputs() is
  'Un producto x canal por fila: precio vigente + costo actual + comisión + servicio de pago en línea del canal. Impuestos NO viene de acá -- decisión del usuario, varía demasiado pedido a pedido para ser un % fijo confiable.';

grant execute on function product_profitability_inputs() to authenticated;

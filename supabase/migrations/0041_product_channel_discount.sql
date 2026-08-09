-- 0041_product_channel_discount.sql
-- Fase 18: "Descuento" editable por producto x canal en la calculadora de
-- Rentabilidad -- a diferencia de comisión/regalía/pago en línea (que son
-- por CANAL, mismo % para todos los productos), el descuento puede variar
-- producto a producto dentro de un mismo canal (ej. una promo puntual), así
-- que necesita su propia tabla versionada al nivel de channel_prices
-- (product_id + channel_id), no channel_cost_items (que es solo por canal).

create table if not exists product_channel_discounts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  channel_id uuid not null references channels(id),
  discount_percent numeric(6,4) not null check (discount_percent >= 0 and discount_percent <= 1),
  valid_from date not null default current_date,
  valid_to date,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_discount_per_product_channel
  on product_channel_discounts (product_id, channel_id)
  where valid_to is null;

alter table product_channel_discounts enable row level security;
create policy "product_channel_discounts select" on product_channel_discounts for select
  using (
    has_permission('expenses', false)
    and exists (select 1 from products p where p.id = product_channel_discounts.product_id and p.location_id = current_profile_location())
  );
create policy "product_channel_discounts write" on product_channel_discounts for all
  using (
    has_permission('expenses', true)
    and exists (select 1 from products p where p.id = product_channel_discounts.product_id and p.location_id = current_profile_location())
  )
  with check (
    has_permission('expenses', true)
    and exists (select 1 from products p where p.id = product_channel_discounts.product_id and p.location_id = current_profile_location())
    and created_by = auth.uid()
  );

create or replace function set_product_channel_discount(p_product_id uuid, p_channel_id uuid, p_percent numeric)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_product_location uuid;
  v_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para modificar descuentos';
  end if;
  if p_percent < 0 or p_percent > 1 then
    raise exception 'El descuento debe estar entre 0 y 1';
  end if;

  select location_id into v_product_location from products where id = p_product_id;
  if v_product_location is null or v_product_location <> current_profile_location() then
    raise exception 'Producto inválido para tu ubicación';
  end if;

  update product_channel_discounts
    set valid_to = current_date
  where product_id = p_product_id and channel_id = p_channel_id and valid_to is null;

  -- 0 no necesita fila propia -- "sin descuento" es el default (coalesce a
  -- 0 en product_profitability_inputs), así que si el usuario vuelve a 0
  -- solo se cierra la fila vigente y no se inserta una nueva vacía.
  if p_percent > 0 then
    insert into product_channel_discounts (product_id, channel_id, discount_percent, valid_from, created_by)
    values (p_product_id, p_channel_id, p_percent, current_date, auth.uid())
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function set_product_channel_discount(uuid, uuid, numeric) to authenticated;

-- product_profitability_inputs (0031/0037) suma la columna de descuento --
-- mismo problema de siempre: hay que dropear antes de recrear porque cambia
-- el returns table(...). Esta vez en una sola sentencia porque no depende
-- de ningún enum nuevo (a diferencia de la 0037/0038).
drop function if exists product_profitability_inputs();

create or replace function product_profitability_inputs()
returns table (
  product_id uuid,
  product_name text,
  channel_id uuid,
  channel_name text,
  price numeric,
  cost numeric,
  commission_percent numeric,
  online_payment_fee_percent numeric,
  discount_percent numeric
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
    coalesce(cci_fee.value_percent, 0),
    coalesce(pcd.discount_percent, 0)
  from channel_prices cp
  join products p on p.id = cp.product_id
  join channels c on c.id = cp.channel_id
  left join channel_cost_items cci_comm on cci_comm.channel_id = c.id and cci_comm.type = 'commission' and cci_comm.valid_to is null
  left join channel_cost_items cci_fee on cci_fee.channel_id = c.id and cci_fee.type = 'online_payment_fee' and cci_fee.valid_to is null
  left join product_channel_discounts pcd on pcd.product_id = p.id and pcd.channel_id = c.id and pcd.valid_to is null
  where cp.valid_to is null
    and p.location_id = current_profile_location()
    and p.active = true
    and has_permission('expenses', false)
  order by p.name, c.name;
$$;

comment on function product_profitability_inputs() is
  'Un producto x canal por fila: precio vigente + costo actual + comisión + servicio de pago en línea del canal + descuento puntual de ese producto en ese canal. Impuestos NO viene de acá -- decisión del usuario, varía demasiado pedido a pedido para ser un % fijo confiable.';

grant execute on function product_profitability_inputs() to authenticated;

-- seed_fase8_panino_nino.sql
-- Carga de datos reales: marcas, catálogo Panino + Nino (reporte PedidosYa
-- 1/5 al 7/8), precio inicial por canal (ticket promedio -- REVISAR contra
-- lista de precios real), y las 3 recetas de la familia "lomo" confirmadas
-- (Lomo grande + papas, Lomo mediano + papas, Lomo mediano + fritas).
--
-- Idempotente: se puede correr más de una vez sin duplicar filas (usa
-- NOT EXISTS / ON CONFLICT DO NOTHING en cada insert).
--
-- Asume location_id fijo '00000000-0000-0000-0000-000000000001', el mismo
-- que usa supabase/seed.sql original -- si tu Supabase real usa otro id,
-- avisame antes de correr esto.
--
-- Requiere que ya exista al menos un profile con role='socio' (created_by
-- de stock_item_costs / product_recipe_items) -- ya lo tenés, es la cuenta
-- con la que entrás vos.

do $$
declare
  v_location uuid := '00000000-0000-0000-0000-000000000001';
  v_socio uuid;
begin
  select id into v_socio from profiles where role = 'socio' order by created_at limit 1;
  if v_socio is null then
    raise exception 'No hay ningún profile con role=socio todavía -- creá tu usuario primero (ver README) y volvé a correr este script.';
  end if;
end $$;

-- ========== 1. Marcas ==========

insert into brands (location_id, name, exclusive_channel_id)
select '00000000-0000-0000-0000-000000000001', 'Panino', null
where not exists (select 1 from brands where location_id = '00000000-0000-0000-0000-000000000001' and name = 'Panino');

insert into brands (location_id, name, exclusive_channel_id)
select '00000000-0000-0000-0000-000000000001', 'Nino', null
where not exists (select 1 from brands where location_id = '00000000-0000-0000-0000-000000000001' and name = 'Nino');

insert into brands (location_id, name, exclusive_channel_id)
select '00000000-0000-0000-0000-000000000001', 'Goat', c.id
from channels c
where c.name = 'rappi'
  and not exists (select 1 from brands where location_id = '00000000-0000-0000-0000-000000000001' and name = 'Goat');

-- ========== 2. Catálogo (78 productos: Panino + Nino) ==========
-- current_cost = 0 salvo los 3 productos con receta confirmada más abajo.
-- 0 es el default de la tabla, no un valor inventado -- profitability-engine
-- ya sabe tratar current_cost=0 como "sin costo cargado" (margen no
-- confiable hasta cargar receta o costo manual).

insert into products (location_id, brand_id, name, current_cost)
select '00000000-0000-0000-0000-000000000001', b.id, v.name, v.cost
from (values
  ('NINO Lomo Completo + Papas', 'Nino', 0),
  ('Nino 2 con queso+ papa c huevo', 'Nino', 0),
  ('2 ninos + papas con huevo', 'Nino', 0),
  ('NINO Lomo Con Queso + Papas', 'Nino', 0),
  ('12 empanadas', 'Nino', 0),
  ('Lomo pollo completo + papas', 'Nino', 0),
  ('Nino completo + 6 empanadas', 'Nino', 0),
  ('6 empanadas', 'Nino', 0),
  ('Nino cheddar y bacon + papas', 'Nino', 0),
  ('Milanesa napolitana + fritas', 'Nino', 0),
  ('Nino lomo completo + 6 empanadas', 'Nino', 0),
  ('3 empanadas', 'Nino', 0),
  ('Empanada de carne', 'Nino', 0),
  ('Milanesa + fritas', 'Nino', 0),
  ('NINO Papas Grandes', 'Nino', 0),
  ('12 empanadas + coca 15lts', 'Nino', 0),
  ('Nino 2 pollo + 1 papa c huev', 'Nino', 0),
  ('Gaseosa Coca-Cola 500 ml', 'Nino', 0),
  ('Burger simple completa + papas', 'Nino', 0),
  ('Milanesa a caballo + fritas', 'Nino', 0),
  ('NINO Papas Con Cheddar Y Bacon', 'Nino', 0),
  ('Burger simple cn cheddar+ papa', 'Nino', 0),
  ('NINO Papas Con Huevo', 'Nino', 0),
  ('Burger doble bacon + papas', 'Nino', 0),
  ('Milanesa patagonia + fritas', 'Nino', 0),
  ('Gaseosa Coca Cola 500 Cc.', 'Nino', 0),
  ('Burger doble completa + papas', 'Nino', 0),
  ('Empanada de jamon y queso', 'Nino', 0),
  ('Gaseosa Coca Cola Sin Azúcar 500 Cc.', 'Nino', 0),
  ('Agua Saborizada Levite Pomelo 500Ml', 'Nino', 0),
  ('Empanada cheeseburger', 'Nino', 0),
  ('Empanada de pollo', 'Nino', 0),
  ('Agua Saborizada Levite Manzana 500Ml', 'Nino', 0),
  ('Lomo grande + papas', 'Panino', 4330.52),
  ('Lomo mediano + papas', 'Panino', 3282.11),
  ('2 Lomitos Completos Grandes + 1 Papa con Huevo', 'Panino', 0),
  ('Sandwich de milanesa + fritas', 'Panino', 0),
  ('Bacon mediano + fritas', 'Panino', 0),
  ('Bacon grande + fritas', 'Panino', 0),
  ('Combo ganó argentina', 'Panino', 0),
  ('2 Lomitos Completos Medianos + 1 Papa con Huevo', 'Panino', 0),
  ('2 Lomitos de Pollo completos Grandes + 1 Papa con Huevo', 'Panino', 0),
  ('Pollo completo grande + fritas', 'Panino', 0),
  ('Milanesa + fritas', 'Panino', 0),
  ('Superlomo completo + fritas', 'Panino', 0),
  ('Hamburguesa completa + fritas', 'Panino', 0),
  ('Milanesa napolitana + fritas', 'Panino', 0),
  ('Combo campeón del mundo', 'Panino', 0),
  ('Lomo mediano + fritas', 'Panino', 3282.11),
  ('Sandwich capresse', 'Panino', 0),
  ('Supermila napolitana + frita', 'Panino', 0),
  ('Promo grande panino', 'Panino', 0),
  ('Papas con huevo', 'Panino', 0),
  ('Hamburguesas sliders', 'Panino', 0),
  ('Supermila patagonia + fritas', 'Panino', 0),
  ('Papas fritas grandes', 'Panino', 0),
  ('Súper sandwich de milanesa + fritas', 'Panino', 0),
  ('Papas con cheddar', 'Panino', 0),
  ('Milanesa a caballo + fritas', 'Panino', 0),
  ('Combo festejamos igual', 'Panino', 0),
  ('Milanesa patagonia + fritas', 'Panino', 0),
  ('Milanesa bacon + fritas', 'Panino', 0),
  ('Hambur doble completa + fritas', 'Panino', 0),
  ('Slider bacon & cheddar + papas', 'Panino', 0),
  ('Ensalada chicken', 'Panino', 0),
  ('Hambur doble cheddar + fritas', 'Panino', 0),
  ('Hamburguesa bacon + fritas', 'Panino', 0),
  ('Coca cola original', 'Panino', 0),
  ('Superlomo Completo + 2 Papas con Huevo', 'Panino', 0),
  ('Supermila bacon + fritas', 'Panino', 0),
  ('Supermila a caballo + fritas', 'Panino', 0),
  ('Hamburguesa c cheddar + fritas', 'Panino', 0),
  ('Sprite original', 'Panino', 0),
  ('Agua saborizada pera', 'Panino', 0),
  ('Fanta original', 'Panino', 0),
  ('Coca cola zero', 'Panino', 0),
  ('Agua saborizada pomelo', 'Panino', 0),
  ('Sprite zero', 'Panino', 0)
) as v(name, brand_name, cost)
join brands b on b.name = v.brand_name and b.location_id = '00000000-0000-0000-0000-000000000001'
where not exists (
  select 1 from products p
  where p.name = v.name and p.brand_id = b.id and p.location_id = '00000000-0000-0000-0000-000000000001'
);

-- ========== 3. Precio inicial por canal (PedidosYa) ==========
-- Ticket promedio del reporte (venta bruta / unidades) del período 1/5-7/8.
-- NO es necesariamente el precio de lista actual -- ajustar con la lista
-- real cuando la tengas. valid_from = hoy (default de la columna).

insert into channel_prices (product_id, channel_id, price)
select p.id, c.id, v.price
from (values
  ('NINO Lomo Completo + Papas', 'Nino', 17471.0),
  ('Nino 2 con queso+ papa c huevo', 'Nino', 26551.0),
  ('2 ninos + papas con huevo', 'Nino', 32842.0),
  ('NINO Lomo Con Queso + Papas', 'Nino', 15500.0),
  ('12 empanadas', 'Nino', 29435.0),
  ('Lomo pollo completo + papas', 'Nino', 15167.0),
  ('Nino completo + 6 empanadas', 'Nino', 27167.0),
  ('6 empanadas', 'Nino', 15053.0),
  ('Nino cheddar y bacon + papas', 'Nino', 17806.0),
  ('Milanesa napolitana + fritas', 'Nino', 19317.0),
  ('Nino lomo completo + 6 empanadas', 'Nino', 32700.0),
  ('3 empanadas', 'Nino', 8308.0),
  ('Empanada de carne', 'Nino', 3500.0),
  ('Milanesa + fritas', 'Nino', 17000.0),
  ('NINO Papas Grandes', 'Nino', 9786.0),
  ('12 empanadas + coca 15lts', 'Nino', 31500.0),
  ('Nino 2 pollo + 1 papa c huev', 'Nino', 28000.0),
  ('Gaseosa Coca-Cola 500 ml', 'Nino', 3500.0),
  ('Burger simple completa + papas', 'Nino', 15000.0),
  ('Milanesa a caballo + fritas', 'Nino', 18750.0),
  ('NINO Papas Con Cheddar Y Bacon', 'Nino', 15000.0),
  ('Burger simple cn cheddar+ papa', 'Nino', 12750.0),
  ('NINO Papas Con Huevo', 'Nino', 12000.0),
  ('Burger doble bacon + papas', 'Nino', 22000.0),
  ('Milanesa patagonia + fritas', 'Nino', 21500.0),
  ('Gaseosa Coca Cola 500 Cc.', 'Nino', 3500.0),
  ('Burger doble completa + papas', 'Nino', 18000.0),
  ('Empanada de jamon y queso', 'Nino', 2833.0),
  ('Gaseosa Coca Cola Sin Azúcar 500 Cc.', 'Nino', 3500.0),
  ('Agua Saborizada Levite Pomelo 500Ml', 'Nino', 3500.0),
  ('Empanada cheeseburger', 'Nino', 3167.0),
  ('Empanada de pollo', 'Nino', 3000.0),
  ('Agua Saborizada Levite Manzana 500Ml', 'Nino', 3500.0),
  ('Lomo grande + papas', 'Panino', 22167.0),
  ('Lomo mediano + papas', 'Panino', 18802.0),
  ('2 Lomitos Completos Grandes + 1 Papa con Huevo', 'Panino', 41300.0),
  ('Sandwich de milanesa + fritas', 'Panino', 24226.0),
  ('Bacon mediano + fritas', 'Panino', 19027.0),
  ('Bacon grande + fritas', 'Panino', 23337.0),
  ('Combo ganó argentina', 'Panino', 16188.0),
  ('2 Lomitos Completos Medianos + 1 Papa con Huevo', 'Panino', 36700.0),
  ('2 Lomitos de Pollo completos Grandes + 1 Papa con Huevo', 'Panino', 39800.0),
  ('Pollo completo grande + fritas', 'Panino', 18495.0),
  ('Milanesa + fritas', 'Panino', 16216.0),
  ('Superlomo completo + fritas', 'Panino', 37233.0),
  ('Hamburguesa completa + fritas', 'Panino', 13626.0),
  ('Milanesa napolitana + fritas', 'Panino', 22840.0),
  ('Combo campeón del mundo', 'Panino', 22000.0),
  ('Lomo mediano + fritas', 'Panino', 17550.0),
  ('Sandwich capresse', 'Panino', 18606.0),
  ('Supermila napolitana + frita', 'Panino', 34250.0),
  ('Promo grande panino', 'Panino', 44000.0),
  ('Papas con huevo', 'Panino', 12762.0),
  ('Hamburguesas sliders', 'Panino', 19750.0),
  ('Supermila patagonia + fritas', 'Panino', 37500.0),
  ('Papas fritas grandes', 'Panino', 10885.0),
  ('Súper sandwich de milanesa + fritas', 'Panino', 43500.0),
  ('Papas con cheddar', 'Panino', 15917.0),
  ('Milanesa a caballo + fritas', 'Panino', 18520.0),
  ('Combo festejamos igual', 'Panino', 18000.0),
  ('Milanesa patagonia + fritas', 'Panino', 21075.0),
  ('Milanesa bacon + fritas', 'Panino', 20425.0),
  ('Hambur doble completa + fritas', 'Panino', 19050.0),
  ('Slider bacon & cheddar + papas', 'Panino', 9000.0),
  ('Ensalada chicken', 'Panino', 15500.0),
  ('Hambur doble cheddar + fritas', 'Panino', 20433.0),
  ('Hamburguesa bacon + fritas', 'Panino', 15500.0),
  ('Coca cola original', 'Panino', 4136.0),
  ('Superlomo Completo + 2 Papas con Huevo', 'Panino', 43500.0),
  ('Supermila bacon + fritas', 'Panino', 35000.0),
  ('Supermila a caballo + fritas', 'Panino', 34000.0),
  ('Hamburguesa c cheddar + fritas', 'Panino', 13200.0),
  ('Sprite original', 'Panino', 4500.0),
  ('Agua saborizada pera', 'Panino', 3500.0),
  ('Fanta original', 'Panino', 3500.0),
  ('Coca cola zero', 'Panino', 3500.0),
  ('Agua saborizada pomelo', 'Panino', 3500.0),
  ('Sprite zero', 'Panino', 3500.0)
) as v(product_name, brand_name, price)
join brands b on b.name = v.brand_name and b.location_id = '00000000-0000-0000-0000-000000000001'
join products p on p.name = v.product_name and p.brand_id = b.id
cross join channels c
where c.name = 'pedidosya'
on conflict (product_id, channel_id) where valid_to is null do nothing;

-- ========== 4. Insumos confirmados (familia Lomo) ==========
-- 17 insumos: 11 compartidos entre Grande/Mediano + 3 pares que cambian de
-- costo unitario según tamaño (Pan, Lomo, Papas -- confirmado con tus dos
-- capturas, NO es un error mío: el costo por kg de "Papas" difiere entre
-- el corte que usa el combo grande y el mediano).

insert into stock_items (location_id, name, unit)
select '00000000-0000-0000-0000-000000000001', v.name, v.unit
from (values
  ('Pan Grande', 'unidad'),
  ('Pan Mediano', 'unidad'),
  ('Lomo 150', 'unidad'),
  ('Lomo 100', 'unidad'),
  ('Lechuga', 'kg'),
  ('Tomate', 'kg'),
  ('Queso', 'kg'),
  ('Paleta', 'kg'),
  ('Huevo', 'unidad'),
  ('Mayonesa', 'kg'),
  ('Papas Grande', 'kg'),
  ('Papas Mediano', 'kg'),
  ('Sobre de papas', 'unidad'),
  ('Sal fina', 'kg'),
  ('Aceite', 'litro'),
  ('Papel Termico', 'unidad'),
  ('Bolsa delivery blanca', 'unidad')
) as v(name, unit)
where not exists (
  select 1 from stock_items si where si.name = v.name and si.location_id = '00000000-0000-0000-0000-000000000001'
);

-- ========== 5. Costo de insumos (calculado desde tus dos capturas: costo_linea / cantidad) ==========

insert into stock_item_costs (stock_item_id, unit_cost, created_by)
select si.id, v.unit_cost, (select id from profiles where role = 'socio' order by created_at limit 1)
from (values
  ('Pan Grande', 615.00),
  ('Pan Mediano', 540.00),
  ('Lomo 150', 2153.09),
  ('Lomo 100', 1369.68),
  ('Lechuga', 6000.00),
  ('Tomate', 1555.00),
  ('Queso', 8200.00),
  ('Paleta', 4200.00),
  ('Huevo', 155.56),
  ('Mayonesa', 2782.50),
  ('Papas Grande', 1890.00),
  ('Papas Mediano', 1760.00),
  ('Sobre de papas', 37.44),
  ('Sal fina', 1635.00),
  ('Aceite', 1825.20),
  ('Papel Termico', 187850.00),
  ('Bolsa delivery blanca', 67.26)
) as v(name, unit_cost)
join stock_items si on si.name = v.name and si.location_id = '00000000-0000-0000-0000-000000000001'
where not exists (
  select 1 from stock_item_costs sic where sic.stock_item_id = si.id and sic.valid_to is null
);

-- ========== 6. Recetas confirmadas ==========

-- Lomo grande + papas (Panino)
insert into product_recipe_items (product_id, stock_item_id, quantity, created_by)
select p.id, si.id, v.qty, (select id from profiles where role = 'socio' order by created_at limit 1)
from (values
  ('Pan Grande', 1),
  ('Lomo 150', 1),
  ('Lechuga', 0.02),
  ('Tomate', 0.04),
  ('Queso', 0.04),
  ('Paleta', 0.02),
  ('Huevo', 1),
  ('Mayonesa', 0.02),
  ('Papas Grande', 0.2),
  ('Sobre de papas', 1),
  ('Sal fina', 0.002),
  ('Aceite', 0.025),
  ('Papel Termico', 0.0012),
  ('Bolsa delivery blanca', 1)
) as v(stock_item_name, qty)
join stock_items si on si.name = v.stock_item_name and si.location_id = '00000000-0000-0000-0000-000000000001'
join brands b on b.name = 'Panino' and b.location_id = '00000000-0000-0000-0000-000000000001'
join products p on p.name = 'Lomo grande + papas' and p.brand_id = b.id
where not exists (select 1 from product_recipe_items pri where pri.product_id = p.id and pri.stock_item_id = si.id);

-- Lomo mediano + papas (Panino)
insert into product_recipe_items (product_id, stock_item_id, quantity, created_by)
select p.id, si.id, v.qty, (select id from profiles where role = 'socio' order by created_at limit 1)
from (values
  ('Pan Mediano', 1),
  ('Lomo 100', 1),
  ('Lechuga', 0.02),
  ('Tomate', 0.04),
  ('Queso', 0.02),
  ('Paleta', 0.02),
  ('Huevo', 1),
  ('Mayonesa', 0.02),
  ('Papas Mediano', 0.2),
  ('Sobre de papas', 1),
  ('Sal fina', 0.002),
  ('Aceite', 0.025),
  ('Papel Termico', 0.0012),
  ('Bolsa delivery blanca', 1)
) as v(stock_item_name, qty)
join stock_items si on si.name = v.stock_item_name and si.location_id = '00000000-0000-0000-0000-000000000001'
join brands b on b.name = 'Panino' and b.location_id = '00000000-0000-0000-0000-000000000001'
join products p on p.name = 'Lomo mediano + papas' and p.brand_id = b.id
where not exists (select 1 from product_recipe_items pri where pri.product_id = p.id and pri.stock_item_id = si.id);

-- Lomo mediano + fritas (Panino) -- misma receta que Lomo mediano + papas
insert into product_recipe_items (product_id, stock_item_id, quantity, created_by)
select p.id, si.id, v.qty, (select id from profiles where role = 'socio' order by created_at limit 1)
from (values
  ('Pan Mediano', 1),
  ('Lomo 100', 1),
  ('Lechuga', 0.02),
  ('Tomate', 0.04),
  ('Queso', 0.02),
  ('Paleta', 0.02),
  ('Huevo', 1),
  ('Mayonesa', 0.02),
  ('Papas Mediano', 0.2),
  ('Sobre de papas', 1),
  ('Sal fina', 0.002),
  ('Aceite', 0.025),
  ('Papel Termico', 0.0012),
  ('Bolsa delivery blanca', 1)
) as v(stock_item_name, qty)
join stock_items si on si.name = v.stock_item_name and si.location_id = '00000000-0000-0000-0000-000000000001'
join brands b on b.name = 'Panino' and b.location_id = '00000000-0000-0000-0000-000000000001'
join products p on p.name = 'Lomo mediano + fritas' and p.brand_id = b.id
where not exists (select 1 from product_recipe_items pri where pri.product_id = p.id and pri.stock_item_id = si.id);

-- 0019_channel_cost_placeholders.sql
-- Fase 2.
--
-- generate_settlement() y el cálculo de comisión de Pedix en record_sale()
-- necesitan un valor de comisión por canal para poder operar. El prompt
-- original no especificó los porcentajes reales de Panino ("Comisión: X%"
-- quedó como incógnita en el addendum). Estos son PLACEHOLDERS explícitos,
-- no datos inventados presentados como reales -- se marcan con vigencia
-- desde hoy y quedan documentados acá y en el README para que se reemplacen
-- por los valores reales de Panino antes de operar en producción.

insert into channel_cost_items (channel_id, type, value_percent, valid_from)
select id, 'commission', 0.20, current_date -- placeholder 20%, AJUSTAR
from channels where name = 'pedidosya'
on conflict do nothing;

insert into channel_cost_items (channel_id, type, value_percent, valid_from)
select id, 'commission', 0.20, current_date -- placeholder 20%, AJUSTAR
from channels where name = 'rappi'
on conflict do nothing;

insert into channel_cost_items (channel_id, type, value_percent, valid_from)
select id, 'commission', 0.15, current_date -- placeholder 15%, AJUSTAR
from channels where name = 'pedix'
on conflict do nothing;

-- Pedix no tenía channel_settlement_rules (0006 solo cargó pedidosya/rappi,
-- porque esa tabla se pensó para el ciclo de liquidación agrupada). Se
-- reutiliza acá para representar el offset de PAGO DE COMISIÓN de Pedix
-- (no un ciclo de cobro, que para Pedix es inmediato). payment_offset_days
-- = 15 es placeholder -- AJUSTAR con el dato real de cuándo Panino paga
-- efectivamente la comisión a Pedix.
insert into channel_settlement_rules (channel_id, period_days, payment_offset_days, advance_available, valid_from)
select id, 0, 15, false, current_date
from channels where name = 'pedix'
on conflict do nothing;

comment on table channel_cost_items is
  'Costos por canal (comisión y, a futuro, IVA/descuentos/adelantos -- ver channel_cost_type). Los valores cargados en 0019 son PLACEHOLDERS de arranque, no cifras reales de Panino -- reemplazar antes de confiar en generate_settlement()/record_sale() para decisiones reales.';

-- 0006_channels.sql

create type settlement_model as enum ('grouped', 'immediate');
-- grouped: PedidosYa/Rappi -> pasan por settlements
-- immediate: Pedix/Mostrador -> cash_movement directo (settlement_id null en orders)

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  settlement_model settlement_model not null
);

insert into channels (name, settlement_model) values
  ('pedidosya', 'grouped'),
  ('rappi', 'grouped'),
  ('pedix', 'immediate'),
  ('mostrador', 'immediate'),
  ('whatsapp', 'immediate')
on conflict (name) do nothing;

-- Versionado: Channel 1 -> N (corregido en addendum v3, antes decía 1-1)
create table if not exists channel_settlement_rules (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id),
  period_days integer not null default 7, -- ej. lunes-domingo = 7
  payment_offset_days integer not null,   -- días desde el cierre del período hasta el cobro normal
  advance_available boolean not null default false,
  valid_from date not null default current_date,
  valid_to date
);

create unique index if not exists one_active_rule_per_channel
  on channel_settlement_rules (channel_id)
  where valid_to is null;

create type channel_cost_type as enum (
  'commission', 'vat_on_commission', 'financed_discount', 'promotion', 'advance_cost', 'other_adjustment'
);

create table if not exists channel_cost_items (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id),
  type channel_cost_type not null,
  value_percent numeric(6,4),
  value_fixed numeric(14,2),
  valid_from date not null default current_date,
  valid_to date,
  check (
    (value_percent is not null and value_fixed is null) or
    (value_percent is null and value_fixed is not null)
  )
);

create unique index if not exists one_active_cost_item_per_channel_type
  on channel_cost_items (channel_id, type)
  where valid_to is null;

-- Reglas base de Panino (según el prompt maestro). Ajustables desde la UI en Fase 2.
insert into channel_settlement_rules (channel_id, period_days, payment_offset_days, advance_available)
select id, 7,
  case name when 'pedidosya' then 5 when 'rappi' then 3 else 0 end, -- viernes=+5 desde lunes de cierre, miércoles=+3
  case name when 'pedidosya' then true else false end
from channels
where name in ('pedidosya', 'rappi')
on conflict do nothing;

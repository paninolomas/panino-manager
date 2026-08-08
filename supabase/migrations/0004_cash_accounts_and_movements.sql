-- 0004_cash_accounts_and_movements.sql
-- Regla central del sistema: ningún saldo se edita directo, siempre se deriva
-- de SUM(cash_movements). cash_movements es INSERT-ONLY (ver 0011 RLS y 0012 RPC).

create type account_type as enum ('efectivo', 'banco', 'mercado_pago', 'otra_billetera');

create table if not exists cash_accounts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  type account_type not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create type movement_direction as enum ('ingreso', 'egreso');

create type movement_origin_type as enum (
  'opening_balance',
  'channel_collection',
  'commission_payment',
  'supplier_payment',
  'expense',
  'withdrawal',
  'manual_adjustment',
  'transfer',
  'reversal'
);

create table if not exists cash_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references cash_accounts(id),
  amount numeric(14,2) not null check (amount > 0),
  direction movement_direction not null,
  date date not null,
  origin_type movement_origin_type not null,
  origin_id uuid, -- referencia polimórfica (obligation, expense, settlement, commission_charge, withdrawal, o movimiento original si es reversal). Integridad garantizada por las funciones RPC de 0012, no por FK cruzada.
  transfer_group_id uuid, -- comparte valor entre los dos movimientos de una transferencia
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),

  constraint manual_adjustment_requires_description
    check (origin_type <> 'manual_adjustment' or description is not null),

  constraint reversal_requires_origin
    check (origin_type <> 'reversal' or origin_id is not null),

  constraint transfer_requires_group
    check (origin_type <> 'transfer' or transfer_group_id is not null)
);

comment on table cash_movements is 'Tabla insert-only. Ninguna corrección edita una fila existente: toda corrección es un movimiento nuevo (ver origin_type=reversal). Ver 0011 para el revoke explícito de UPDATE/DELETE.';

-- Evita revertir el mismo movimiento dos veces.
create unique index if not exists one_reversal_per_movement
  on cash_movements (origin_id)
  where origin_type = 'reversal';

-- Evita más de un opening_balance "de origen" (no revertido) por cuenta.
-- (La verificación de "no revertido" para permitir un opening_balance corregido
-- se hace en la función RPC create_opening_balance, ver 0012, consultando
-- one_reversal_per_movement antes de insertar uno nuevo.)
create index if not exists idx_cash_movements_account_date on cash_movements (account_id, date);
create index if not exists idx_cash_movements_origin on cash_movements (origin_type, origin_id);

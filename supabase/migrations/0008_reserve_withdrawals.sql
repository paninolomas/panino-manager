-- 0008_reserve_withdrawals.sql

create table if not exists reserve_targets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  amount numeric(14,2) not null check (amount >= 0),
  valid_from date not null default current_date,
  valid_to date
);

create unique index if not exists one_active_reserve_per_location
  on reserve_targets (location_id)
  where valid_to is null;

create type approval_signal as enum ('green', 'yellow', 'red');

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  partner_user_id uuid not null references profiles(id),
  amount numeric(14,2) not null check (amount > 0),
  date date not null,
  approved_signal approval_signal not null,
  movement_id uuid not null unique references cash_movements(id),
  created_at timestamptz not null default now()
);

-- Soporte de importación (Fase 6) -- tablas vacías, sin UI todavía.
create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id),
  file_name text,
  imported_at timestamptz not null default now(),
  total_rows integer not null default 0,
  ok_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  imported_by uuid references profiles(id)
);

create table if not exists column_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id),
  name text not null,
  mapping jsonb not null
);

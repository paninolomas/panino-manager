-- 0007_products_orders.sql
-- Fase 1: productos con costo simple (sin recetas todavía, Sección 22-23 del prompt maestro).

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  category text,
  current_cost numeric(14,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists channel_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  channel_id uuid not null references channels(id),
  price numeric(14,2) not null check (price >= 0),
  valid_from date not null default current_date,
  valid_to date
);

create unique index if not exists one_active_price_per_product_channel
  on channel_prices (product_id, channel_id)
  where valid_to is null;

-- settlements se define acá porque orders lo referencia (nullable)
create type settlement_status as enum ('pending', 'collected', 'partial');

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id),
  period_start date not null,
  period_end date not null,
  gross_amount numeric(14,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  adjustment_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  expected_payment_date date not null,
  actual_payment_date date,
  status settlement_status not null default 'pending',
  collection_movement_id uuid unique references cash_movements(id),
  created_at timestamptz not null default now()
);

create table if not exists commission_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid, -- FK agregada tras crear orders
  settlement_id uuid references settlements(id),
  amount numeric(14,2) not null check (amount > 0),
  estimated_payment_date date not null,
  status obligation_status not null default 'pending', -- reutiliza el enum pending/paid
  paid_movement_id uuid unique references cash_movements(id),
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  channel_id uuid not null references channels(id),
  settlement_id uuid references settlements(id), -- null para Pedix/Mostrador (settlement_model = immediate)
  commission_charge_id uuid references commission_charges(id), -- solo Pedix en Fase 1
  external_order_number text,
  order_datetime timestamptz not null default now(),
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null check (total >= 0),
  payment_method text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),

  constraint settlement_matches_channel_model check (
    -- no se valida el modelo acá por simplicidad de constraint (requeriría subquery);
    -- se valida en la capa de servicios/repositorio antes de insertar.
    true
  )
);

alter table commission_charges
  add constraint commission_charges_order_fk foreign key (order_id) references orders(id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric(10,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0)
);

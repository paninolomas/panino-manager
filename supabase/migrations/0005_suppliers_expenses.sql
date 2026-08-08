-- 0005_suppliers_expenses.sql

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  name text not null,
  default_payment_terms_days integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create type obligation_status as enum ('pending', 'paid');

create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  amount numeric(14,2) not null check (amount > 0),
  purchase_date date not null,
  estimated_due_date date not null,
  status obligation_status not null default 'pending',
  paid_movement_id uuid unique references cash_movements(id), -- unique => imposible pagar dos veces
  created_at timestamptz not null default now()
);

-- Bloquea edición de monto/fecha una vez pagada. Corrección = reversión + nueva obligación.
create or replace function guard_obligation_immutability()
returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and (new.amount <> old.amount or new.estimated_due_date <> old.estimated_due_date) then
    raise exception 'No se puede modificar el monto/fecha de una obligación ya pagada. Cree una reversión y una obligación nueva.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_obligation_immutability on obligations;
create trigger trg_obligation_immutability
  before update on obligations
  for each row execute function guard_obligation_immutability();

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('variable', 'fijo', 'personal')),
  parent_id uuid references expense_categories(id)
);

create type expense_status as enum ('pending', 'paid');

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  category_id uuid not null references expense_categories(id),
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null,
  status expense_status not null default 'pending',
  supplier_id uuid references suppliers(id),
  recurring_template_id uuid, -- FK agregada después de crear recurring_expense_templates
  paid_movement_id uuid unique references cash_movements(id),
  created_at timestamptz not null default now()
);

create or replace function guard_expense_immutability()
returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and (new.amount <> old.amount or new.date <> old.date) then
    raise exception 'No se puede modificar el monto/fecha de un gasto ya pagado. Cree una reversión y un gasto nuevo.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_expense_immutability on expenses;
create trigger trg_expense_immutability
  before update on expenses
  for each row execute function guard_expense_immutability();

create table if not exists recurring_expense_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references expense_categories(id),
  amount numeric(14,2) not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 28),
  frequency text not null default 'monthly' check (frequency = 'monthly'),
  active boolean not null default true
);

alter table expenses
  add constraint expenses_recurring_template_fk
  foreign key (recurring_template_id) references recurring_expense_templates(id);

-- Categorías base (configurables, no hardcodeadas en el código de la app)
insert into expense_categories (name, type) values
  ('Proveedores', 'variable'),
  ('Packaging', 'variable'),
  ('Personal', 'personal'),
  ('Alquiler', 'fijo'),
  ('Servicios', 'fijo'),
  ('Impuestos', 'fijo'),
  ('Higiene', 'fijo'),
  ('Software', 'fijo'),
  ('Seguros', 'fijo'),
  ('Imprevistos', 'fijo'),
  ('Equipamiento', 'fijo'),
  ('Otros', 'fijo')
on conflict do nothing;

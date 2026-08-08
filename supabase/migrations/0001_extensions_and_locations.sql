-- 0001_extensions_and_locations.sql
-- Extensiones necesarias y tabla base de ubicación (single-location hoy,
-- preparado para multi-local sin rehacer el modelo).

create extension if not exists "pgcrypto";

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table locations is 'Ubicaciones/sedes. Fase 1 tiene un único registro (Panino). Toda tabla transaccional referencia location_id desde el día uno.';

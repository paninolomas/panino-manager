-- 0047_expense_estimated_payment_date.sql
-- Fase 23: fecha estimada de pago para gastos, separada de `date` (que es
-- la fecha del gasto en sí, no cuándo se planea pagarlo) -- mismo patrón
-- que ya existe en obligations (purchase_date vs estimated_due_date).
-- Se usa en "Hoy" para mostrar qué gastos vencen pronto/están atrasados.

alter table expenses
  add column if not exists estimated_payment_date date;

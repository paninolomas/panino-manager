-- 0046_account_balances.sql
-- Fase 22: expone el saldo actual por cuenta. No agrega ningún dato nuevo
-- -- "ningún saldo se edita directo, siempre se deriva de SUM(cash_movements)"
-- (comentario original en 0004_cash_accounts_and_movements.sql) -- esto es
-- simplemente esa suma agregada en SQL en vez de traer todos los
-- movimientos al cliente para sumarlos ahí.

create or replace function account_balances()
returns table (account_id uuid, balance numeric)
language sql
stable
security definer set search_path = public
as $$
  select
    a.id as account_id,
    coalesce(
      sum(case when m.direction = 'ingreso' then m.amount when m.direction = 'egreso' then -m.amount else 0 end),
      0
    ) as balance
  from cash_accounts a
  left join cash_movements m on m.account_id = a.id
  where a.location_id = current_profile_location()
    and has_permission('movements', false)
  group by a.id;
$$;

grant execute on function account_balances() to authenticated;

comment on function account_balances() is
  'Fase 22: saldo por cuenta = SUM(ingreso) - SUM(egreso) sobre cash_movements. Incluye cuentas sin movimientos (left join) con saldo 0.';

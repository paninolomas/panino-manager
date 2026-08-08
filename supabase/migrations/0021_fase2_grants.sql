-- 0021_fase2_grants.sql
-- Fase 2. Mismo principio que 0016: mínimo privilegio, grants explícitos por
-- función, nunca un grant amplio. record_sale ya estaba otorgada en 0016 --
-- CREATE OR REPLACE no revoca grants existentes, así que no hace falta
-- volver a otorgarla, pero se re-declara igual para que este archivo sea
-- autocontenido y explícito sobre qué puede ejecutar "authenticated" tras
-- Fase 2.

grant execute on function generate_settlement(uuid, date, date) to authenticated;
grant execute on function collect_settlement(uuid, uuid, date) to authenticated;
grant execute on function pay_commission(uuid, uuid, date) to authenticated;
grant execute on function record_advance_decision(uuid, numeric, date, date, numeric, numeric, numeric, numeric, text, text, numeric) to authenticated;
grant execute on function record_sale(uuid, text, jsonb, text) to authenticated;

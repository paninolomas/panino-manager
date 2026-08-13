-- 0044_daily_sales_closings_delete_policy.sql
-- Fase 20b: faltaba la policy de delete en daily_sales_closings (0043) --
-- el cierre rápido diario se podía cargar pero no borrar si el usuario se
-- equivocaba (bug real reportado: "no lo puedo editar ni eliminar"). El
-- insert/update ya funcionan porque van por el RPC upsert_daily_sales_closing
-- (security definer, no depende de policy de RLS), pero el delete se hace
-- directo desde el cliente (`.from(...).delete()`) y sí pasa por RLS.

create policy "daily_sales_closings delete" on daily_sales_closings for delete
  using (has_permission('sales', true) and location_id = current_profile_location());

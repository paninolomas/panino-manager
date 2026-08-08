-- 0028_daily_sales_series.sql
-- Fase 5. Única fuente de la serie histórica diaria que usa el motor de
-- objetivos (goals-engine.ts) para ponderar por día de la semana. Solo
-- agrega (sum/count) -- el motor de objetivos, en TypeScript, es quien
-- decide qué hacer con esos números.

create or replace function daily_sales_series(p_from date, p_to date)
returns table (date date, revenue numeric, orders_count bigint)
language sql
stable
security definer set search_path = public
as $$
  select
    o.order_datetime::date as date,
    sum(o.total) as revenue,
    count(*) as orders_count
  from orders o
  where o.location_id = current_profile_location()
    and has_permission('movements', false)
    and o.order_datetime::date between p_from and p_to
  group by o.order_datetime::date
  order by o.order_datetime::date;
$$;

grant execute on function daily_sales_series(date, date) to authenticated;

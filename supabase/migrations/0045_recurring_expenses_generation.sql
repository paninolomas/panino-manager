-- 0045_recurring_expenses_generation.sql
-- Fase 21: conecta recurring_expense_templates (existía desde 0005 pero
-- nunca se usaba para generar gastos reales, solo para la proyección del
-- Simulador) con los gastos reales de Gastos. Flujo: el usuario marca un
-- gasto ya cargado como "fijo" (mark_expense_as_recurring) -> eso crea una
-- plantilla con el día del mes de ese gasto -> generate_recurring_expenses
-- se llama automáticamente al abrir Gastos y crea, de forma idempotente,
-- el gasto pendiente del mes actual para cada plantilla activa que todavía
-- no lo tenga.

alter table recurring_expense_templates
  add column if not exists description text not null default '';

create or replace function mark_expense_as_recurring(p_expense_id uuid)
returns recurring_expense_templates
language plpgsql security definer set search_path = public
as $$
declare
  v_expense expenses;
  v_template recurring_expense_templates;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para marcar gastos como fijos';
  end if;

  select * into v_expense from expenses where id = p_expense_id and location_id = current_profile_location();
  if v_expense.id is null then
    raise exception 'El gasto no existe o no pertenece a esta ubicación';
  end if;
  if v_expense.recurring_template_id is not null then
    raise exception 'Este gasto ya está marcado como fijo';
  end if;

  insert into recurring_expense_templates (category_id, description, amount, day_of_month, active)
  values (v_expense.category_id, v_expense.description, v_expense.amount, least(extract(day from v_expense.date)::integer, 28), true)
  returning * into v_template;

  update expenses set recurring_template_id = v_template.id where id = p_expense_id;

  return v_template;
end;
$$;

grant execute on function mark_expense_as_recurring(uuid) to authenticated;

create or replace function unmark_expense_as_recurring(p_expense_id uuid, p_deactivate_template boolean default true)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_template_id uuid;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para desmarcar gastos fijos';
  end if;

  select recurring_template_id into v_template_id
  from expenses where id = p_expense_id and location_id = current_profile_location();

  if v_template_id is null then
    raise exception 'Este gasto no está marcado como fijo';
  end if;

  update expenses set recurring_template_id = null where id = p_expense_id;

  if p_deactivate_template then
    update recurring_expense_templates set active = false where id = v_template_id;
  end if;
end;
$$;

grant execute on function unmark_expense_as_recurring(uuid, boolean) to authenticated;

-- Idempotente: por cada plantilla activa, si NO existe ya un gasto de esa
-- plantilla con fecha dentro del mismo mes/año que p_as_of, lo crea como
-- pendiente. Se puede llamar en cada carga de la página de Gastos sin
-- miedo a duplicar -- el chequeo de existencia es por mes calendario, no
-- por día exacto (así si el usuario editó la fecha del gasto generado, no
-- se genera un segundo).
create or replace function generate_recurring_expenses(p_as_of date)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_template record;
  v_target_date date;
  v_count integer := 0;
begin
  if not has_permission('expenses', true) then
    raise exception 'Sin permiso para generar gastos fijos';
  end if;

  for v_template in
    select * from recurring_expense_templates where active = true
  loop
    if not exists (
      select 1 from expenses
      where recurring_template_id = v_template.id
        and location_id = current_profile_location()
        and date_trunc('month', date) = date_trunc('month', p_as_of)
    ) then
      v_target_date := make_date(extract(year from p_as_of)::integer, extract(month from p_as_of)::integer, v_template.day_of_month);
      insert into expenses (location_id, category_id, description, amount, date, status, recurring_template_id)
      values (current_profile_location(), v_template.category_id, v_template.description, v_template.amount, v_target_date, 'pending', v_template.id);
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function generate_recurring_expenses(date) to authenticated;

comment on function generate_recurring_expenses(date) is
  'Fase 21: llamar al cargar la página de Gastos (idempotente) para que los gastos fijos marcados con mark_expense_as_recurring aparezcan solos cada mes, sin intervención manual.';

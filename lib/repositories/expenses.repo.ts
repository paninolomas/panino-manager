import { createSupabaseServerClient } from "../supabase/server";

export async function listExpenseCategories() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, type, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function createExpenseCategory(input: { name: string; type: "variable" | "fijo" | "personal"; parentId?: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({ name: input.name, type: input.type, parent_id: input.parentId ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExpenseCategory(
  categoryId: string,
  input: { name?: string; type?: "variable" | "fijo" | "personal"; active?: boolean }
) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.type !== undefined) patch.type = input.type;
  if (input.active !== undefined) patch.active = input.active;
  const { data, error } = await supabase.from("expense_categories").update(patch).eq("id", categoryId).select().single();
  if (error) throw error;
  return data;
}

export async function listExpenses() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("id, description, amount, date, status, category_id, supplier_id, recurring_template_id, estimated_payment_date")
    .order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createExpense(input: {
  locationId: string;
  categoryId: string;
  description: string;
  amount: number;
  date: string;
  supplierId?: string;
  estimatedPaymentDate?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      location_id: input.locationId,
      category_id: input.categoryId,
      description: input.description,
      amount: input.amount,
      date: input.date,
      supplier_id: input.supplierId ?? null,
      estimated_payment_date: input.estimatedPaymentDate ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Editar un gasto PENDIENTE (monto/fecha/descripción/categoría/fecha
 * estimada de pago). Una vez pagado, el trigger guard_expense_immutability
 * (0005) rechaza cambios de monto/fecha -- misma lógica que
 * updateObligation, la validación real vive en la base, no acá.
 */
export async function updateExpense(
  expenseId: string,
  input: { description?: string; amount?: number; date?: string; categoryId?: string; estimatedPaymentDate?: string | null }
) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.description !== undefined) patch.description = input.description;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.date !== undefined) patch.date = input.date;
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.estimatedPaymentDate !== undefined) patch.estimated_payment_date = input.estimatedPaymentDate;
  const { data, error } = await supabase.from("expenses").update(patch).eq("id", expenseId).select().single();
  if (error) throw error;
  return data;
}

/** Deshace el pago de un gasto: revierte el movimiento de caja (nunca lo borra) y devuelve el gasto a 'pending', donde updateExpense ya puede editarlo. */
export async function reverseExpensePayment(expenseId: string, description?: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverse_expense_payment", {
    p_expense_id: expenseId,
    p_description: description ?? "Reversión de pago de gasto",
  });
  if (error) throw error;
  return data as string;
}

export async function payExpense(input: {
  expenseId: string;
  accountId: string;
  date: string;
  description?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pay_expense", {
    p_expense_id: input.expenseId,
    p_account_id: input.accountId,
    p_date: input.date,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}

export async function createRecurringTemplate(input: {
  categoryId: string;
  amount: number;
  dayOfMonth: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recurring_expense_templates")
    .insert({ category_id: input.categoryId, amount: input.amount, day_of_month: input.dayOfMonth })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Próxima ocurrencia proyectada de cada gasto recurrente activo, a partir de
 * `asOfDate`. Fase 2 solo proyecta UNA ocurrencia por template (la próxima) --
 * suficiente para los horizontes de 30 días o menos que usa el producto; si
 * `day_of_month` ya pasó este mes, proyecta al mes siguiente.
 */
export async function listRecurringExpenseProjections(asOfDate: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("recurring_expense_templates")
    .select("id, amount, day_of_month, active")
    .eq("active", true);
  if (error) throw error;

  const [year, month, day] = asOfDate.split("-").map(Number);
  return (data ?? []).map((t) => {
    let projectedYear = year;
    let projectedMonth = month;
    if (t.day_of_month < day) {
      projectedMonth += 1;
      if (projectedMonth > 12) {
        projectedMonth = 1;
        projectedYear += 1;
      }
    }
    const dueDate = `${projectedYear}-${String(projectedMonth).padStart(2, "0")}-${String(t.day_of_month).padStart(2, "0")}`;
    return { amount: Number(t.amount), dueDate };
  });
}

/** Marca un gasto ya cargado como "fijo" (Fase 21): crea la plantilla recurrente con su categoría/descripción/monto/día del mes, y a partir de ahí generate_recurring_expenses lo repone solo cada mes. */
export async function markExpenseAsRecurring(expenseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_expense_as_recurring", { p_expense_id: expenseId });
  if (error) throw error;
  return data;
}

/** Desmarca un gasto como fijo -- por default también desactiva la plantilla (deja de generarse el mes que viene). */
export async function unmarkExpenseAsRecurring(expenseId: string, deactivateTemplate = true) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unmark_expense_as_recurring", {
    p_expense_id: expenseId,
    p_deactivate_template: deactivateTemplate,
  });
  if (error) throw error;
}

/** Idempotente -- llamar al cargar la página de Gastos. Genera el gasto pendiente del mes actual para cada plantilla fija activa que todavía no lo tenga (Fase 21). Devuelve cuántos generó. */
export async function ensureRecurringExpensesGenerated(asOfDate: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generate_recurring_expenses", { p_as_of: asOfDate });
  if (error) throw error;
  return data as number;
}


import { createSupabaseServerClient } from "../supabase/server";

export async function listExpenseCategories() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, type")
    .order("name");
  if (error) throw error;
  return data;
}

export async function listExpenses() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("id, description, amount, date, status, category_id, supplier_id")
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
    })
    .select()
    .single();
  if (error) throw error;
  return data;
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

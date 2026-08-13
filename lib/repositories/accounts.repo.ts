import { createSupabaseServerClient } from "../supabase/server";

/**
 * Saldo actual por cuenta (Fase 22): "ningún saldo se edita directo, siempre
 * se deriva de SUM(cash_movements)" (comentario original en 0004) -- esto
 * simplemente expone esa suma. Ingreso suma, egreso resta; como reversal ya
 * se registra como un movimiento más (no como un update), no hace falta
 * ningún caso especial acá.
 */
export async function listAccountBalances() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("account_balances");
  if (error) throw error;
  return data as { account_id: string; balance: number }[];
}

export async function listAccounts() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_accounts")
    .select("id, name, type, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function createAccount(input: { name: string; type: string; locationId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("cash_accounts")
    .insert({ name: input.name, type: input.type as any, location_id: input.locationId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(accountId: string, input: { name?: string; active?: boolean }) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.active !== undefined) patch.active = input.active;
  const { data, error } = await supabase.from("cash_accounts").update(patch).eq("id", accountId).select().single();
  if (error) throw error;
  return data;
}

export async function createOpeningBalance(input: {
  accountId: string;
  amount: number;
  direction: "ingreso" | "egreso";
  date: string;
  description?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_opening_balance", {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_direction: input.direction,
    p_date: input.date,
    p_description: input.description ?? "Saldo inicial",
  });
  if (error) throw error;
  return data;
}

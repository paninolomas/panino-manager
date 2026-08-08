import { createSupabaseServerClient } from "../supabase/server";

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

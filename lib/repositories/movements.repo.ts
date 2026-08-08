import { createSupabaseServerClient } from "../supabase/server";
import type { CashMovement } from "../../types/domain";

/** Trae los movimientos (todas las cuentas visibles según RLS) para alimentar al motor financiero. */
export async function listMovements(params?: { accountId?: string; from?: string; to?: string }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("cash_movements")
    .select("id, account_id, amount, direction, date, origin_type, description")
    .order("date", { ascending: false });

  if (params?.accountId) query = query.eq("account_id", params.accountId);
  if (params?.from) query = query.gte("date", params.from);
  if (params?.to) query = query.lte("date", params.to);

  const { data, error } = await query;
  if (error) throw error;

  const movements: CashMovement[] = (data ?? []).map((m) => ({
    id: m.id,
    accountId: m.account_id,
    amount: Number(m.amount),
    direction: m.direction,
    date: m.date,
    originType: m.origin_type,
  }));
  return movements;
}

export async function createManualMovement(input: {
  accountId: string;
  amount: number;
  direction: "ingreso" | "egreso";
  date: string;
  description: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_manual_movement", {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_direction: input.direction,
    p_date: input.date,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}

export async function transferBetweenAccounts(input: {
  fromAccount: string;
  toAccount: string;
  amount: number;
  date: string;
  description: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("transfer_between_accounts", {
    p_from_account: input.fromAccount,
    p_to_account: input.toAccount,
    p_amount: input.amount,
    p_date: input.date,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}

export async function reverseMovement(movementId: string, description?: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverse_movement", {
    p_movement_id: movementId,
    p_description: description ?? "Reversión",
  });
  if (error) throw error;
  return data;
}

export async function recordWithdrawal(input: {
  accountId: string;
  amount: number;
  date: string;
  signal: "green" | "yellow" | "red";
  description?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_withdrawal", {
    p_account_id: input.accountId,
    p_amount: input.amount,
    p_date: input.date,
    p_signal: input.signal,
    p_description: input.description ?? "Retiro de socio",
  });
  if (error) throw error;
  return data;
}

import { createSupabaseServerClient } from "../supabase/server";

export async function getActiveReserveTarget(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reserve_targets")
    .select("amount")
    .is("valid_to", null)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.amount) : 0;
}

export async function setReserveTarget(amount: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_reserve_target", { p_amount: amount });
  if (error) throw error;
  return data;
}

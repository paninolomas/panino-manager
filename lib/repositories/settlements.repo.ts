import { createSupabaseServerClient } from "../supabase/server";
import type { ExpectedInflow, CommissionCharge } from "../../types/domain";

export async function listPendingSettlements() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("settlements")
    .select("id, channel_id, period_start, period_end, gross_amount, commission_amount, net_amount, expected_payment_date, status")
    .eq("status", "pending")
    .order("expected_payment_date");
  if (error) throw error;
  return data;
}

export async function getSettlementById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("settlements")
    .select("id, channel_id, period_start, period_end, gross_amount, commission_amount, net_amount, expected_payment_date, status")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** Para alimentar el motor financiero (calculateExpectedInflows). */
export async function listExpectedInflows(): Promise<ExpectedInflow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("settlements")
    .select("id, net_amount, expected_payment_date")
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    amount: Number(s.net_amount),
    expectedDate: s.expected_payment_date,
  }));
}

export async function generateSettlement(input: { channelId: string; periodStart: string; periodEnd: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("generate_settlement", {
    p_channel_id: input.channelId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
  });
  if (error) throw error;
  return data;
}

export async function collectSettlement(input: { settlementId: string; accountId: string; date: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("collect_settlement", {
    p_settlement_id: input.settlementId,
    p_account_id: input.accountId,
    p_date: input.date,
  });
  if (error) throw error;
  return data;
}

export async function listPendingCommissionCharges() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_charges")
    .select("id, order_id, amount, estimated_payment_date, status")
    .eq("status", "pending")
    .order("estimated_payment_date");
  if (error) throw error;
  return data;
}

/** Para el motor financiero (calculateCommittedCommissions). */
export async function listPendingCommissionsForEngine(): Promise<CommissionCharge[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_charges")
    .select("id, amount, estimated_payment_date, status")
    .eq("status", "pending");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    amount: Number(c.amount),
    estimatedPaymentDate: c.estimated_payment_date,
    status: c.status,
  }));
}

export async function payCommission(input: { commissionChargeId: string; accountId: string; date: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pay_commission", {
    p_commission_charge_id: input.commissionChargeId,
    p_account_id: input.accountId,
    p_date: input.date,
  });
  if (error) throw error;
  return data;
}

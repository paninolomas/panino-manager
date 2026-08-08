import { createSupabaseServerClient } from "../supabase/server";
import type { PedidosYaAdvanceSimulation, AdvanceRecommendation } from "../../types/domain";

export async function recordAdvanceDecision(input: {
  settlementId: string | null;
  advanceFeePercent: number;
  vatPercent: number;
  simulation: PedidosYaAdvanceSimulation;
  recommendation: AdvanceRecommendation;
  projectedAvailableBeforeNormalDate: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_advance_decision", {
    p_settlement_id: input.settlementId,
    p_net_receivable: input.simulation.netReceivableIfWait,
    p_normal_payment_date: input.simulation.waitDate,
    p_advance_date: input.simulation.advanceDate,
    p_advance_fee_percent: input.advanceFeePercent,
    p_vat_percent: input.vatPercent,
    p_advance_cost: input.simulation.advanceCost,
    p_net_if_advance: input.simulation.netReceivableIfAdvance,
    p_decision: input.recommendation.decision,
    p_reason: input.recommendation.reason,
    p_projected_available: input.projectedAvailableBeforeNormalDate,
  });
  if (error) throw error;
  return data;
}

export async function listAdvanceDecisions() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("advance_simulations")
    .select("id, net_receivable, advance_cost, decision, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

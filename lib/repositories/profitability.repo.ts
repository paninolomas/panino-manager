import { createSupabaseServerClient } from "../supabase/server";
import type { ProductChannelSalesSummary } from "../../types/domain";

export async function setChannelPrice(input: { productId: string; channelId: string; price: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_channel_price", {
    p_product_id: input.productId,
    p_channel_id: input.channelId,
    p_price: input.price,
  });
  if (error) throw error;
  return data;
}

export async function listChannelPrices() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("channel_prices")
    .select("id, product_id, channel_id, price")
    .is("valid_to", null);
  if (error) throw error;
  return data;
}

export async function getSalesSummary(periodStart: string, periodEnd: string): Promise<ProductChannelSalesSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sales_summary_by_product_channel", {
    p_period_start: periodStart,
    p_period_end: periodEnd,
  });
  if (error) throw error;
  return (data ?? []).map((r: { product_id: string; channel_id: string; units_sold: number; gross_revenue: number }) => ({
    productId: r.product_id,
    channelId: r.channel_id,
    unitsSold: Number(r.units_sold),
    grossRevenue: Number(r.gross_revenue),
  }));
}

/** costo actual por producto, para alimentar el motor de rentabilidad. */
export async function getCostByProduct(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("products").select("id, current_cost");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((p) => [p.id, Number(p.current_cost)]));
}

/** comisión vigente por canal, para alimentar el motor de rentabilidad. */
export async function getCommissionByChannel(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("channel_cost_items")
    .select("channel_id, value_percent")
    .eq("type", "commission")
    .is("valid_to", null);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((c) => [c.channel_id, Number(c.value_percent ?? 0)]));
}

export async function insertMarginSnapshots(input: {
  periodStart: string;
  periodEnd: string;
  rows: {
    productId: string;
    channelId: string;
    unitsSold: number;
    unitPrice: number;
    unitCost: number;
    unitProfit: number;
    marginPercent: number;
    totalProfit: number;
    totalContribution: number;
  }[];
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("insert_margin_snapshots", {
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
    p_rows: input.rows,
  });
  if (error) throw error;
  return data as number;
}

export async function listLatestMarginSnapshots() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("margin_snapshots")
    .select("id, product_id, channel_id, period_start, period_end, units_sold, unit_price, unit_cost, unit_profit, margin_percent, total_profit")
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data;
}

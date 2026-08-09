import { createSupabaseServerClient } from "../supabase/server";
import type { ProductChannelSalesSummary } from "../../types/domain";

/** Filas de entrada para la calculadora de rentabilidad por producto (precio + costo + comisión + pago en línea + descuento, ya cruzados en product_profitability_inputs, 0036/0037/0041). */
export async function getProductProfitabilityInputs() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("product_profitability_inputs");
  if (error) throw error;
  return (data ?? []).map((r: { product_id: string; product_name: string; channel_id: string; channel_name: string; price: number; cost: number; commission_percent: number; online_payment_fee_percent: number; discount_percent: number }) => ({
    productId: r.product_id,
    productName: r.product_name,
    channelId: r.channel_id,
    channelName: r.channel_name,
    price: Number(r.price),
    cost: Number(r.cost),
    commissionPercent: Number(r.commission_percent),
    onlinePaymentFeePercent: Number(r.online_payment_fee_percent),
    discountPercent: Number(r.discount_percent),
  }));
}

/** Descuento puntual de un producto en un canal (Fase 18) -- a diferencia de comisión/regalía/pago en línea, es por producto x canal, no solo por canal (set_product_channel_discount, 0041). */
export async function setProductChannelDiscount(input: { productId: string; channelId: string; percent: number }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_product_channel_discount", {
    p_product_id: input.productId,
    p_channel_id: input.channelId,
    p_percent: input.percent,
  });
  if (error) throw error;
  return data;
}

export async function setChannelOnlinePaymentFee(channelId: string, percent: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_channel_online_payment_fee", { p_channel_id: channelId, p_percent: percent });
  if (error) throw error;
  return data as string;
}

export async function getActiveRoyaltyRate(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("royalty_rates").select("percent").is("valid_to", null).maybeSingle();
  if (error) throw error;
  return data ? Number(data.percent) : 0;
}

export async function setRoyaltyRate(percent: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_royalty_rate", { p_percent: percent });
  if (error) throw error;
  return data as string;
}

export async function setChannelCommission(channelId: string, percent: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_channel_commission", { p_channel_id: channelId, p_percent: percent });
  if (error) throw error;
  return data as string;
}

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

/** "Servicio pago en línea" vigente por canal (Fase 16), para el form de edición -- valores por defecto. */
export async function getOnlinePaymentFeeByChannel(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("channel_cost_items")
    .select("channel_id, value_percent")
    .eq("type", "online_payment_fee")
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

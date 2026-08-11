import { createSupabaseServerClient } from "../supabase/server";
import { requireSession } from "../auth/session";

export type SalesPeriod = {
  id: string;
  label: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

export type SalesPeriodItem = {
  productId: string;
  productName: string;
  channelId: string;
  channelName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  unitNetProfit: number;
};

/** Períodos cargados, con sus totales ya sumados (unidades, facturación, ganancia real) -- para la lista/comparación, sin traer todas las líneas de cada uno. */
export async function listSalesPeriods(): Promise<
  (SalesPeriod & { totalUnits: number; totalRevenue: number; totalNetProfit: number; itemCount: number })[]
> {
  const supabase = await createSupabaseServerClient();
  const { data: periods, error } = await supabase
    .from("sales_periods")
    .select("id, label, period_start, period_end, created_at")
    .order("period_start", { ascending: false });
  if (error) throw error;

  const { data: items, error: itemsError } = await supabase
    .from("sales_period_items")
    .select("period_id, quantity, unit_price, unit_net_profit");
  if (itemsError) throw itemsError;

  return (periods ?? []).map((p) => {
    const periodItems = (items ?? []).filter((i) => i.period_id === p.id);
    return {
      id: p.id,
      label: p.label,
      periodStart: p.period_start,
      periodEnd: p.period_end,
      createdAt: p.created_at,
      totalUnits: periodItems.reduce((sum, i) => sum + Number(i.quantity), 0),
      totalRevenue: periodItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
      totalNetProfit: periodItems.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_net_profit), 0),
      itemCount: periodItems.length,
    };
  });
}

export async function createSalesPeriod(input: { label: string | null; periodStart: string; periodEnd: string }): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const profile = await requireSession();
  const { data, error } = await supabase
    .from("sales_periods")
    .insert({
      location_id: profile.locationId,
      label: input.label,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteSalesPeriod(periodId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("sales_periods").delete().eq("id", periodId);
  if (error) throw error;
}

/** Líneas de un período con nombre de producto/canal ya resueltos -- para la grilla de carga y el detalle. Resuelve los nombres en TS (no con select embebido de Supabase) para no depender de la caché de relaciones de PostgREST -- mismo criterio que el resto del repo. */
export async function getSalesPeriodItems(periodId: string): Promise<SalesPeriodItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data: items, error } = await supabase
    .from("sales_period_items")
    .select("product_id, channel_id, quantity, unit_price, unit_cost, unit_net_profit")
    .eq("period_id", periodId);
  if (error) throw error;
  if ((items ?? []).length === 0) return [];

  const [{ data: products, error: productsError }, { data: channels, error: channelsError }] = await Promise.all([
    supabase.from("products").select("id, name"),
    supabase.from("channels").select("id, name"),
  ]);
  if (productsError) throw productsError;
  if (channelsError) throw channelsError;
  const productNames = new Map((products ?? []).map((p) => [p.id, p.name as string]));
  const channelNames = new Map((channels ?? []).map((c) => [c.id, c.name as string]));

  return (items ?? []).map((r) => ({
    productId: r.product_id,
    productName: productNames.get(r.product_id) ?? "",
    channelId: r.channel_id,
    channelName: channelNames.get(r.channel_id) ?? "",
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    unitCost: Number(r.unit_cost),
    unitNetProfit: Number(r.unit_net_profit),
  }));
}

/**
 * Reemplaza las líneas de un período de una sola vez -- mismo patrón que
 * saveProductRecipe (recipes.repo.ts): la UI manda la grilla entera
 * (producto x canal, con la cantidad que se cargó en cada uno; 0 o vacío =
 * no se vendió eso en el período), acá se borra lo viejo y se inserta lo
 * nuevo. unitPrice/unitCost/unitNetProfit vienen YA calculados desde
 * afuera (page.tsx, con calculateProductProfitability) -- este repo no
 * calcula nada, solo persiste la foto que le pasan.
 */
export async function saveSalesPeriodItems(
  periodId: string,
  lines: { productId: string; channelId: string; quantity: number; unitPrice: number; unitCost: number; unitNetProfit: number }[]
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error: deleteError } = await supabase.from("sales_period_items").delete().eq("period_id", periodId);
  if (deleteError) throw deleteError;

  const toInsert = lines.filter((l) => l.quantity > 0);
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("sales_period_items").insert(
      toInsert.map((l) => ({
        period_id: periodId,
        product_id: l.productId,
        channel_id: l.channelId,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        unit_cost: l.unitCost,
        unit_net_profit: l.unitNetProfit,
      }))
    );
    if (insertError) throw insertError;
  }
}

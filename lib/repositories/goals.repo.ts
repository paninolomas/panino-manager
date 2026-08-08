import { createSupabaseServerClient } from "../supabase/server";
import { listMovements } from "./movements.repo";
import { getSalesSummary, getCostByProduct, getCommissionByChannel } from "./profitability.repo";
import { calculateTotalLiquidity } from "../services/financial-engine";
import { buildMarginSnapshots } from "../services/profitability-engine";
import type { Goal, DailySeriesPoint, GoalVariable } from "../../types/domain";

export async function listGoals(): Promise<Goal[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("goals")
    .select("id, type, variable, target_value, period_start, period_end")
    .order("period_start", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((g) => ({
    id: g.id,
    type: g.type,
    variable: g.variable,
    targetValue: Number(g.target_value),
    periodStart: g.period_start,
    periodEnd: g.period_end,
  }));
}

export async function createGoal(input: {
  locationId: string;
  createdBy: string;
  type: "weekly" | "monthly" | "annual";
  variable: GoalVariable;
  targetValue: number;
  periodStart: string;
  periodEnd: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("goals")
    .insert({
      location_id: input.locationId,
      created_by: input.createdBy,
      type: input.type,
      variable: input.variable,
      target_value: input.targetValue,
      period_start: input.periodStart,
      period_end: input.periodEnd,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Serie diaria de facturación (única variable con granularidad diaria confiable en Fase 5, vía orders). */
export async function getDailyRevenueSeries(from: string, to: string): Promise<DailySeriesPoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("daily_sales_series", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((r: { date: string; revenue: number }) => ({ date: r.date, value: Number(r.revenue) }));
}

export async function getDailyOrdersSeries(from: string, to: string): Promise<DailySeriesPoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("daily_sales_series", { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []).map((r: { date: string; orders_count: number }) => ({ date: r.date, value: Number(r.orders_count) }));
}

/**
 * Calcula el valor "logrado" de un objetivo según su variable. Cada variable
 * tiene una fuente de datos distinta -- esto es orquestación (I/O), el
 * cálculo en sí sigue viviendo en los motores puros que ya existían.
 *
 * Nota de alcance (Fase 5): 'ganancia' y 'margen' recalculan sobre la marcha
 * con sales_summary_by_product_channel + costo/comisión vigentes -- si el
 * costo de un producto cambió DURANTE el período, el cálculo usa el costo
 * ACTUAL para todo el período (misma limitación que margin_snapshots,
 * documentada ahí). 'ahorro' se define como variación de liquidez total
 * entre el inicio y el fin (o "hoy" si el período no terminó) del período.
 */
export async function getGoalAchievedValue(goal: Goal, asOfDate: string): Promise<number> {
  const effectiveEnd = asOfDate < goal.periodEnd ? asOfDate : goal.periodEnd;

  switch (goal.variable) {
    case "facturacion": {
      const series = await getDailyRevenueSeries(goal.periodStart, effectiveEnd);
      return series.reduce((t, p) => t + p.value, 0);
    }
    case "pedidos": {
      const series = await getDailyOrdersSeries(goal.periodStart, effectiveEnd);
      return series.reduce((t, p) => t + p.value, 0);
    }
    case "ticket_promedio": {
      const [revenueSeries, ordersSeries] = await Promise.all([
        getDailyRevenueSeries(goal.periodStart, effectiveEnd),
        getDailyOrdersSeries(goal.periodStart, effectiveEnd),
      ]);
      const revenue = revenueSeries.reduce((t, p) => t + p.value, 0);
      const orders = ordersSeries.reduce((t, p) => t + p.value, 0);
      return orders > 0 ? revenue / orders : 0;
    }
    case "ganancia":
    case "margen": {
      const [summaries, costByProduct, commissionByChannel] = await Promise.all([
        getSalesSummary(goal.periodStart, effectiveEnd),
        getCostByProduct(),
        getCommissionByChannel(),
      ]);
      const snapshots = buildMarginSnapshots({ summaries, costByProduct, commissionByChannel });
      const totalProfit = snapshots.reduce((t, s) => t + s.totalProfit, 0);
      if (goal.variable === "ganancia") return totalProfit;
      const totalNetRevenue = snapshots.reduce(
        (t, s) => t + s.unitsSold * s.unitPrice * (1 - (commissionByChannel[s.channelId] ?? 0)),
        0
      );
      return totalNetRevenue > 0 ? totalProfit / totalNetRevenue : 0;
    }
    case "caja": {
      const movements = await listMovements({ to: effectiveEnd });
      return calculateTotalLiquidity(movements);
    }
    case "ahorro": {
      const dayBeforeStart = addDaysIso(goal.periodStart, -1);
      const [movementsAtEnd, movementsAtStart] = await Promise.all([
        listMovements({ to: effectiveEnd }),
        listMovements({ to: dayBeforeStart }),
      ]);
      return calculateTotalLiquidity(movementsAtEnd) - calculateTotalLiquidity(movementsAtStart);
    }
    default:
      return 0;
  }
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

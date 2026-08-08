/**
 * Copiloto — herramientas que el modelo puede invocar.
 *
 * Regla no negociable (Sección 27/32 del prompt original): la IA nunca
 * calcula números financieros por su cuenta. Cada herramienta de acá abajo
 * es una llamada a un repositorio + un motor determinístico ya existente
 * (financial-engine, profitability-engine, stock-engine, goals-engine). El
 * modelo solo puede citar lo que estas funciones devuelven en ESTE turno --
 * el system prompt (route.ts) se lo exige explícitamente.
 *
 * Todas las herramientas son de solo lectura o de simulación pura -- ninguna
 * escribe en la base ni ejecuta una acción financiera real (pagar, cobrar,
 * transferir). Si en una fase futura se agrega una herramienta de escritura,
 * debe pedir confirmación explícita del usuario antes de ejecutarse -- no
 * está implementado en Fase 6 a propósito.
 */

import { getStandardHorizons, getHorizonProjectionForDays } from "../services/cash-snapshot";
import { listObligations, listSuppliers } from "../repositories/suppliers.repo";
import {
  listPendingCommissionCharges,
  listPendingSettlements,
  getSettlementById,
} from "../repositories/settlements.repo";
import { getSalesSummary, getCostByProduct, getCommissionByChannel } from "../repositories/profitability.repo";
import { listProducts, listChannels } from "../repositories/sales.repo";
import { listStockItems, listStockMovements } from "../repositories/stock.repo";
import { listGoals, getGoalAchievedValue, getDailyRevenueSeries, getDailyOrdersSeries } from "../repositories/goals.repo";

import { simulatePedidosYaAdvance, recommendAdvanceDecision } from "../services/financial-engine";
import {
  buildMarginSnapshots,
  rankByMarginPercent,
  rankByTotalProfit,
  aggregateProfitByChannel,
  detectMarginDrops,
} from "../services/profitability-engine";
import {
  calculateStockLevel,
  buildPurchaseRecommendations,
  sortByPurchasePriority,
} from "../services/stock-engine";
import { calculateGoalProgress, projectGoalCompletion, computeHistoricalAverageByWeekday } from "../services/goals-engine";
import type { StockMovement } from "../../types/domain";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}

export const COPILOT_TOOLS = [
  {
    name: "get_cash_snapshot",
    description:
      "Disponible real de caja proyectado a hoy, 3, 7, 14 y 30 días (caja + cobros esperados - comprometido - reserva). Usar para '¿cómo viene la caja?', '¿cuánto puedo gastar?', '¿puedo pagar X?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_pending_payments",
    description:
      "Próximos pagos pendientes: obligaciones a proveedores y comisiones de Pedix, ordenados por fecha de vencimiento.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_pending_collections",
    description: "Liquidaciones pendientes de cobro (PedidosYa/Rappi), con fecha esperada y monto neto.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "simulate_pedidosya_advance",
    description:
      "Simula si conviene adelantar o esperar el cobro de una liquidación de PedidosYa. Si se pasa settlement_id, usa el monto y la fecha de esa liquidación; si no, hay que pasar net_receivable y normal_payment_date. El costo del adelanto (advance_fee_percent, vat_percent) SIEMPRE debe pedirse al usuario si no lo dio -- nunca asumir 3%+IVA.",
    input_schema: {
      type: "object",
      properties: {
        settlement_id: { type: "string", description: "UUID de la liquidación pendiente, si se conoce" },
        net_receivable: { type: "number", description: "Monto neto a cobrar, si no hay settlement_id" },
        normal_payment_date: { type: "string", description: "Fecha de cobro normal (YYYY-MM-DD), si no hay settlement_id" },
        advance_date: { type: "string", description: "Fecha en la que se cobraría si se adelanta (YYYY-MM-DD)" },
        advance_fee_percent: { type: "number", description: "Costo del adelanto en fracción, ej. 0.03 para 3%" },
        vat_percent: { type: "number", description: "IVA sobre ese costo en fracción, ej. 0.21 para 21%" },
      },
      required: ["advance_date", "advance_fee_percent", "vat_percent"],
    },
  },
  {
    name: "get_profitability_ranking",
    description:
      "Rentabilidad por producto/canal en un período: mejor margen%, mayor ganancia total, rentabilidad por canal, y alertas si el margen cayó respecto del período anterior de igual duración. Usar para '¿qué producto tiene peor margen?', '¿qué producto deja más plata?', '¿por qué bajó la rentabilidad?'.",
    input_schema: {
      type: "object",
      properties: {
        period_start: { type: "string", description: "YYYY-MM-DD" },
        period_end: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["period_start", "period_end"],
    },
  },
  {
    name: "get_stock_recommendations",
    description:
      "Compras recomendadas por insumo, con prioridad (alta/media/baja/revisar) y nivel de confianza. Usar para '¿qué tengo que comprar?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_goal_progress",
    description:
      "Progreso de los objetivos cargados (facturación, ganancia, pedidos, ticket, margen, caja, ahorro): logrado, faltante, y si el objetivo de facturación sigue siendo alcanzable según el ritmo histórico por día de la semana. Usar para '¿voy a alcanzar el objetivo?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_yesterday_summary",
    description:
      "Ventas, pedidos y ticket promedio de ayer, comparado contra el promedio histórico de ese mismo día de la semana (si hay suficiente historial). Usar para '¿cómo fue ayer?'.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
] as const;

export type CopilotToolName = (typeof COPILOT_TOOLS)[number]["name"];

export async function executeCopilotTool(name: CopilotToolName, input: Record<string, unknown>): Promise<unknown> {
  const today = todayIso();

  switch (name) {
    case "get_cash_snapshot": {
      const { horizons, inputs } = await getStandardHorizons(today);
      return {
        as_of_date: today,
        reserve: inputs.reserve,
        horizons: horizons.map((h) => ({
          horizon_days: h.horizonDays,
          horizon_date: h.horizonDate,
          expected_inflows: h.expectedInflows,
          committed: h.committed,
          available_real: h.availableReal,
        })),
      };
    }

    case "get_pending_payments": {
      const [obligations, suppliers, commissions] = await Promise.all([
        listObligations(),
        listSuppliers(),
        listPendingCommissionCharges(),
      ]);
      const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "proveedor desconocido";
      const items = [
        ...obligations
          .filter((o) => o.status === "pending")
          .map((o) => ({
            type: "obligation" as const,
            description: supplierName(o.supplierId),
            amount: o.amount,
            due_date: o.estimatedDueDate,
          })),
        ...commissions.map((c) => ({
          type: "pedix_commission" as const,
          description: "Comisión Pedix",
          amount: Number(c.amount),
          due_date: c.estimated_payment_date,
        })),
      ].sort((a, b) => a.due_date.localeCompare(b.due_date));
      return { items };
    }

    case "get_pending_collections": {
      const [settlements, channels] = await Promise.all([listPendingSettlements(), listChannels()]);
      const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "canal desconocido";
      return {
        items: settlements.map((s) => ({
          settlement_id: s.id,
          channel: channelName(s.channel_id),
          net_amount: Number(s.net_amount),
          expected_payment_date: s.expected_payment_date,
        })),
      };
    }

    case "simulate_pedidosya_advance": {
      let netReceivable = input.net_receivable as number | undefined;
      let normalPaymentDate = input.normal_payment_date as string | undefined;

      if (input.settlement_id) {
        const settlement = await getSettlementById(input.settlement_id as string);
        netReceivable = Number(settlement.net_amount);
        normalPaymentDate = settlement.expected_payment_date;
      }
      if (!netReceivable || !normalPaymentDate) {
        return { error: "Falta settlement_id, o net_receivable + normal_payment_date." };
      }

      const advanceDate = input.advance_date as string;
      const advanceFeePercent = input.advance_fee_percent as number;
      const vatPercent = input.vat_percent as number;

      const simulation = simulatePedidosYaAdvance({
        netReceivable,
        normalPaymentDate,
        advanceDate,
        advanceFeePercent,
        vatPercent,
      });

      // Disponible proyectado un día ANTES del cobro normal -- así el
      // horizonte no incluye este mismo cobro que estamos evaluando si
      // conviene esperar o adelantar (si lo incluyera, "esperar" siempre
      // parecería seguro porque ya contaría con la plata que justamente
      // está en duda).
      const horizonDays = Math.max(0, daysBetween(today, normalPaymentDate) - 1);
      const projection = await getHorizonProjectionForDays(today, horizonDays);

      const recommendation = recommendAdvanceDecision({
        simulation,
        projectedAvailableBeforeNormalDate: projection.availableReal,
      });

      return {
        wait: { amount: simulation.netReceivableIfWait, date: simulation.waitDate },
        advance: { amount: simulation.netReceivableIfAdvance, date: simulation.advanceDate, cost: simulation.advanceCost },
        projected_available_before_normal_date: projection.availableReal,
        recommendation: recommendation.decision,
        reason: recommendation.reason,
      };
    }

    case "get_profitability_ranking": {
      const periodStart = input.period_start as string;
      const periodEnd = input.period_end as string;
      const periodLength = daysBetween(periodStart, periodEnd);
      const previousStart = addDaysIso(periodStart, -(periodLength + 1));
      const previousEnd = addDaysIso(periodStart, -1);

      const [products, channels, costByProduct, commissionByChannel, currentSummaries, previousSummaries] =
        await Promise.all([
          listProducts(),
          listChannels(),
          getCostByProduct(),
          getCommissionByChannel(),
          getSalesSummary(periodStart, periodEnd),
          getSalesSummary(previousStart, previousEnd),
        ]);

      if (currentSummaries.length === 0) {
        return { error: "No hay ventas registradas en ese período para calcular rentabilidad." };
      }

      const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
      const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

      const current = buildMarginSnapshots({ summaries: currentSummaries, costByProduct, commissionByChannel });
      const previous = buildMarginSnapshots({ summaries: previousSummaries, costByProduct, commissionByChannel });

      const toReadable = (s: (typeof current)[number]) => ({
        product: productName(s.productId),
        channel: channelName(s.channelId),
        units_sold: s.unitsSold,
        margin_percent: s.marginPercent,
        total_profit: s.totalProfit,
      });

      const alerts = detectMarginDrops({ previous, current, thresholdPoints: 0.02 }).map((a) => ({
        product: productName(a.productId),
        channel: channelName(a.channelId),
        previous_margin_percent: a.previousMarginPercent,
        current_margin_percent: a.currentMarginPercent,
        drop_points: a.dropPoints,
      }));

      return {
        best_margin: rankByMarginPercent(current).slice(0, 5).map(toReadable),
        best_total_profit: rankByTotalProfit(current).slice(0, 5).map(toReadable),
        by_channel: Object.fromEntries(
          Object.entries(aggregateProfitByChannel(current)).map(([id, v]) => [channelName(id), v])
        ),
        margin_drop_alerts: alerts,
      };
    }

    case "get_stock_recommendations": {
      const [items, movements] = await Promise.all([listStockItems(), listStockMovements()]);
      const movementsByItem: Record<string, StockMovement[]> = {};
      for (const m of movements) (movementsByItem[m.stockItemId] ??= []).push(m);

      const itemsWithLevel = items.map((i) => ({
        stockItemId: i.id,
        name: i.name,
        unit: i.unit,
        currentStock: calculateStockLevel(movementsByItem[i.id] ?? []),
        safetyStock: Number(i.safety_stock),
      }));

      const recs = sortByPurchasePriority(
        buildPurchaseRecommendations({
          items: itemsWithLevel,
          movementsByItem,
          asOfDate: today,
          consumptionWindowDays: 14,
          purchaseHorizonDays: 3,
        })
      );

      const itemName = (id: string) => itemsWithLevel.find((i) => i.stockItemId === id)?.name ?? id;
      const itemUnit = (id: string) => itemsWithLevel.find((i) => i.stockItemId === id)?.unit ?? "";

      return {
        recommendations: recs.map((r) => ({
          item: itemName(r.stockItemId),
          unit: itemUnit(r.stockItemId),
          current_stock: r.currentStock,
          needed_quantity: r.neededQuantity,
          priority: r.priority,
          confidence: r.confidence,
        })),
      };
    }

    case "get_goal_progress": {
      const goals = await listGoals();
      const results = await Promise.all(
        goals.map(async (goal) => {
          const achievedValue = await getGoalAchievedValue(goal, today);
          const progress = calculateGoalProgress({
            targetValue: goal.targetValue,
            achievedValue,
            periodStart: goal.periodStart,
            periodEnd: goal.periodEnd,
            asOfDate: today,
          });

          let projection = null;
          if (goal.variable === "facturacion") {
            const historyStart = addDaysIso(goal.periodStart, -60);
            const historicalSeries = await getDailyRevenueSeries(historyStart, addDaysIso(goal.periodStart, -1));
            projection = projectGoalCompletion({
              progress,
              periodEnd: goal.periodEnd,
              asOfDate: today,
              historicalSeries,
            });
          }

          return {
            variable: goal.variable,
            type: goal.type,
            period: `${goal.periodStart} a ${goal.periodEnd}`,
            target_value: progress.targetValue,
            achieved_value: progress.achievedValue,
            percent_complete: progress.percentComplete,
            days_remaining: progress.daysRemaining,
            simple_required_daily_average: progress.simpleRequiredDailyAverage,
            weighted_projection: projection
              ? {
                  confidence: projection.confidence,
                  feasible: projection.feasible,
                  projected_remaining_total: projection.projectedRemainingTotal,
                  shortfall: projection.shortfall,
                }
              : "No disponible para esta variable en Fase 5/6 -- solo 'facturacion' tiene ponderación por historial por ahora.",
          };
        })
      );
      return { goals: results };
    }

    case "get_yesterday_summary": {
      const yesterday = addDaysIso(today, -1);
      const [revenueSeries, ordersSeries] = await Promise.all([
        getDailyRevenueSeries(yesterday, yesterday),
        getDailyOrdersSeries(yesterday, yesterday),
      ]);
      const revenue = revenueSeries[0]?.value ?? 0;
      const orders = ordersSeries[0]?.value ?? 0;
      const ticket = orders > 0 ? revenue / orders : 0;

      // Comparación contra el promedio histórico de ese mismo día de la
      // semana, excluyendo ayer para no contaminar su propio promedio.
      const historyStart = addDaysIso(yesterday, -60);
      const historyEnd = addDaysIso(yesterday, -1);
      const historicalSeries = await getDailyRevenueSeries(historyStart, historyEnd);
      const weekdayAverages = computeHistoricalAverageByWeekday(historicalSeries);
      const weekday = new Date(yesterday + "T00:00:00Z").getUTCDay();

      return {
        date: yesterday,
        revenue,
        orders,
        average_ticket: ticket,
        comparison_vs_typical_weekday:
          weekdayAverages !== null
            ? { typical_value: weekdayAverages[weekday], confidence: "estimado" }
            : "No hay suficiente historial (mínimo ~2 semanas) para comparar contra un día típico.",
      };
    }

    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}

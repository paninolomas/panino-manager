/**
 * Motor de simulación "¿qué pasa si?" — capa de servicios.
 *
 * Reutiliza el motor de rentabilidad (precio neto, ganancia por unidad,
 * margen, punto de equilibrio) para calcular dos escenarios -- el actual y
 * el simulado -- a partir de las mismas variables que pedía el prompt
 * original (Sección 16): precio, ventas (volumen), costos, comisión.
 *
 * Es una función pura: no importa Supabase, corre igual en el servidor que
 * en el navegador (la UI la ejecuta client-side para que la simulación sea
 * instantánea, sin viaje de red -- "debe ser rápida y visual").
 */

import { calculateNetPrice, calculateUnitProfit, calculateMarginPercent, calculateBreakEvenUnits } from "./profitability-engine";
import type { SimulationBaseline, SimulationAdjustments, SimulationResult, SimulationScenario } from "../../types/domain";

function computeScenario(params: {
  unitsSold: number;
  unitPrice: number;
  unitCost: number;
  commissionPercent: number;
  fixedCosts: number;
}): SimulationScenario {
  const netPrice = calculateNetPrice(params.unitPrice, params.commissionPercent);
  const unitProfit = calculateUnitProfit(netPrice, params.unitCost);
  const marginPercent = calculateMarginPercent(unitProfit, netPrice);

  const revenue = params.unitsSold * params.unitPrice;
  const netRevenue = params.unitsSold * netPrice;
  const totalCost = params.unitsSold * params.unitCost;
  const contributionTotal = unitProfit * params.unitsSold;
  const profit = contributionTotal - params.fixedCosts;
  const breakEvenUnits = calculateBreakEvenUnits(params.fixedCosts, unitProfit);

  return {
    unitsSold: params.unitsSold,
    unitPrice: params.unitPrice,
    unitCost: params.unitCost,
    commissionPercent: params.commissionPercent,
    revenue,
    netRevenue,
    totalCost,
    profit,
    marginPercent,
    breakEvenUnits,
  };
}

export function runSimulation(
  baseline: SimulationBaseline,
  adjustments: SimulationAdjustments
): SimulationResult {
  const current = computeScenario({
    unitsSold: baseline.unitsSold,
    unitPrice: baseline.unitPrice,
    unitCost: baseline.unitCost,
    commissionPercent: baseline.commissionPercent,
    fixedCosts: baseline.fixedCosts,
  });

  const simulated = computeScenario({
    unitsSold: baseline.unitsSold * (1 + adjustments.volumeDeltaPercent),
    unitPrice: baseline.unitPrice * (1 + adjustments.priceDeltaPercent),
    unitCost: baseline.unitCost * (1 + adjustments.costDeltaPercent),
    commissionPercent: adjustments.commissionOverridePercent ?? baseline.commissionPercent,
    fixedCosts: baseline.fixedCosts,
  });

  return {
    current,
    simulated,
    delta: {
      revenue: simulated.revenue - current.revenue,
      profit: simulated.profit - current.profit,
      marginPercent: simulated.marginPercent - current.marginPercent,
    },
  };
}

/** Presets de la Sección 16 del prompt original, para que la UI no tenga que reinventarlos. */
export const PRICE_DELTA_PRESETS = [0.05, 0.08, 0.1];
export const VOLUME_DELTA_PRESETS = [-0.1, 0, 0.1, 0.2];
export const COST_DELTA_PRESETS = [0.05, 0.1];
export const COMMISSION_PRESETS = [0.3, 0.32, 0.35];

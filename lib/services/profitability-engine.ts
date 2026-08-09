/**
 * Motor de rentabilidad — capa de servicios.
 *
 * Mismas reglas que financial-engine.ts: funciones puras, sin Supabase, sin
 * I/O. La agregación de ventas (unidades, ingreso bruto por producto/canal)
 * la hace una RPC de solo-lectura en la base (sales_summary_by_product_channel);
 * este módulo toma ese resultado + el costo actual del producto + la
 * comisión del canal y calcula el margen -- el cálculo en sí nunca ocurre en
 * SQL ni en el Copiloto.
 *
 * Fase 3 usa Product.current_cost (costo simple, sin recetas -- las recetas
 * son Fase 7). Cuando existan recetas, current_cost pasa a derivarse de ellas
 * y este motor no cambia de forma (Sección K de la arquitectura).
 *
 * "Producto con mayor margen % no necesariamente es el que más plata deja" --
 * por eso se exponen rankings separados por margen% y por ganancia total.
 */

import type { ProductChannelSalesSummary, MarginSnapshot, MarginDropAlert } from "../../types/domain";

/**
 * Calculadora de rentabilidad POR PRODUCTO, independiente de si se vendió o
 * no -- distinta del margen basado en ventas reales de más abajo. Dado el
 * precio vigente por canal, el costo actual (de la receta) y las dos
 * comisiones que aplican (canal + regalía de marca, esta última fija sobre
 * el precio, igual para las 3 marcas), calcula lo mismo que la planilla del
 * usuario: comisión $, regalía $, total obtenido, y "rentabilidad" = total
 * obtenido / costo (no es margen sobre precio -- es cuántas veces el costo
 * se recupera, expresado en %).
 */
export interface ProductProfitabilityInput {
  price: number;
  cost: number;
  commissionPercent: number;
  royaltyPercent: number;
}

export interface ProductProfitabilityResult {
  commissionAmount: number;
  royaltyAmount: number;
  netObtained: number;
  /** null si cost=0 -- dividir por cero daría un número que parece preciso sin serlo (mismo criterio que calculateMarginPercent de abajo). */
  profitabilityPercent: number | null;
}

export function calculateProductProfitability(input: ProductProfitabilityInput): ProductProfitabilityResult {
  const commissionAmount = input.price * input.commissionPercent;
  const royaltyAmount = input.price * input.royaltyPercent;
  const netObtained = input.price - commissionAmount - royaltyAmount;
  const profitabilityPercent = input.cost > 0 ? netObtained / input.cost : null;
  return { commissionAmount, royaltyAmount, netObtained, profitabilityPercent };
}

/** Precio neto = precio realmente cobrado menos la comisión del canal. */
export function calculateNetPrice(unitPrice: number, commissionPercent: number): number {
  return unitPrice * (1 - commissionPercent);
}

export function calculateUnitProfit(netPrice: number, unitCost: number): number {
  return netPrice - unitCost;
}

/** Margen % sobre el precio neto. Devuelve 0 si el precio neto es 0 (evita división por cero). */
export function calculateMarginPercent(unitProfit: number, netPrice: number): number {
  if (netPrice === 0) return 0;
  return unitProfit / netPrice;
}

/**
 * Punto de equilibrio en unidades = costos fijos / contribución unitaria.
 * Si la contribución unitaria es <= 0, nunca se alcanza el equilibrio
 * vendiendo más -- devuelve null en vez de un número negativo o infinito
 * engañoso (Sección 32 del prompt original, "punto de equilibrio cuando
 * corresponda": corresponde solo cuando el producto efectivamente deja
 * contribución positiva).
 */
export function calculateBreakEvenUnits(
  fixedCosts: number,
  unitContributionMargin: number
): number | null {
  if (unitContributionMargin <= 0) return null;
  return fixedCosts / unitContributionMargin;
}

/**
 * Combina un resumen de ventas (unidades + ingreso bruto de un producto en un
 * canal) con el costo actual del producto y la comisión del canal para
 * producir el snapshot de margen de ese producto/canal en el período.
 */
export function buildMarginSnapshot(params: {
  summary: ProductChannelSalesSummary;
  unitCost: number;
  commissionPercent: number;
}): MarginSnapshot {
  const unitPrice =
    params.summary.unitsSold > 0 ? params.summary.grossRevenue / params.summary.unitsSold : 0;
  const netPrice = calculateNetPrice(unitPrice, params.commissionPercent);
  const unitProfit = calculateUnitProfit(netPrice, params.unitCost);
  const marginPercent = calculateMarginPercent(unitProfit, netPrice);
  const totalProfit = unitProfit * params.summary.unitsSold;

  return {
    productId: params.summary.productId,
    channelId: params.summary.channelId,
    unitsSold: params.summary.unitsSold,
    unitPrice,
    unitCost: params.unitCost,
    unitProfit,
    marginPercent,
    totalProfit,
    totalContribution: totalProfit, // simplificación del MVP, ver comentario de arriba
  };
}

/** Construye todos los snapshots del período a partir de los resúmenes de venta. */
export function buildMarginSnapshots(params: {
  summaries: ProductChannelSalesSummary[];
  costByProduct: Record<string, number>;
  commissionByChannel: Record<string, number>;
}): MarginSnapshot[] {
  return params.summaries.map((summary) =>
    buildMarginSnapshot({
      summary,
      unitCost: params.costByProduct[summary.productId] ?? 0,
      commissionPercent: params.commissionByChannel[summary.channelId] ?? 0,
    })
  );
}

/** ¿Cuál tiene mayor margen %? -- no confundir con "cuál deja más plata". */
export function rankByMarginPercent(snapshots: MarginSnapshot[]): MarginSnapshot[] {
  return [...snapshots].sort((a, b) => b.marginPercent - a.marginPercent);
}

/** ¿Cuál me dejó más plata este período? */
export function rankByTotalProfit(snapshots: MarginSnapshot[]): MarginSnapshot[] {
  return [...snapshots].sort((a, b) => b.totalProfit - a.totalProfit);
}

/** Rentabilidad agregada por canal (suma de todos los productos de ese canal). */
export function aggregateProfitByChannel(
  snapshots: MarginSnapshot[]
): Record<string, { totalProfit: number; unitsSold: number }> {
  const result: Record<string, { totalProfit: number; unitsSold: number }> = {};
  for (const s of snapshots) {
    const current = result[s.channelId] ?? { totalProfit: 0, unitsSold: 0 };
    result[s.channelId] = {
      totalProfit: current.totalProfit + s.totalProfit,
      unitsSold: current.unitsSold + s.unitsSold,
    };
  }
  return result;
}

/**
 * Detecta caídas de margen comparando el snapshot del período anterior con el
 * actual, producto por producto y canal por canal. `thresholdPoints` es en
 * fracción (ej. 0.02 = 2 puntos porcentuales), consistente con marginPercent
 * expresado como 0..1.
 */
export function detectMarginDrops(params: {
  previous: MarginSnapshot[];
  current: MarginSnapshot[];
  thresholdPoints: number;
}): MarginDropAlert[] {
  const alerts: MarginDropAlert[] = [];
  const previousByKey = new Map(params.previous.map((s) => [`${s.productId}:${s.channelId}`, s]));

  for (const curr of params.current) {
    const prev = previousByKey.get(`${curr.productId}:${curr.channelId}`);
    if (!prev) continue; // sin período anterior comparable -- no se puede afirmar una caída
    const dropPoints = prev.marginPercent - curr.marginPercent;
    if (dropPoints >= params.thresholdPoints) {
      alerts.push({
        productId: curr.productId,
        channelId: curr.channelId,
        previousMarginPercent: prev.marginPercent,
        currentMarginPercent: curr.marginPercent,
        dropPoints,
      });
    }
  }
  return alerts;
}

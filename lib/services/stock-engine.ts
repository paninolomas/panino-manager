/**
 * Motor de stock — capa de servicios.
 *
 * Mismas reglas que financial-engine.ts y profitability-engine.ts: funciones
 * puras, sin Supabase, sin I/O.
 *
 * Decisión de arquitectura importante para Fase 4: las recetas/ingredientes
 * son Fase 7 (post-MVP) -- todavía no existe una forma de inferir consumo
 * como "ventas × receta". Por eso el consumo diario se ESTIMA a partir del
 * historial de movimientos de salida de stock (registrados manualmente o por
 * compra), no de las ventas. Cuando exista el sistema de recetas, se puede
 * agregar una fuente de estimación más precisa sin romper este motor: solo
 * cambia de dónde sale `DailyConsumptionEstimate`, no cómo se usa después
 * (cobertura, compra recomendada).
 *
 * Regla del prompt original que se respeta literalmente acá: "Nunca inventar
 * datos". Si no hay suficiente historial, la estimación devuelve
 * confidence='insuficiente' y value=0 -- nunca un número que parezca preciso
 * sin serlo.
 */

import type {
  StockMovement,
  DailyConsumptionEstimate,
  CoverageResult,
  RecommendedPurchase,
  ConfidenceLevel,
} from "../../types/domain";

const MIN_DAYS_WITH_DATA_FOR_ESTIMATE = 3;

/** Stock actual = SUM(entradas) - SUM(salidas). Mismo principio que la caja: nunca se edita directo. */
export function calculateStockLevel(movements: StockMovement[]): number {
  return movements.reduce((total, m) => {
    return m.direction === "entrada" ? total + m.quantity : total - m.quantity;
  }, 0);
}

/**
 * Consumo diario estimado = promedio de salidas en la ventana [asOfDate -
 * windowDays, asOfDate]. Se cuentan los DÍAS DISTINTOS con salida registrada
 * (no la cantidad de movimientos) para decidir si hay suficiente información
 * -- 1 sola salida grande no es "suficiente historial", aunque sea un número
 * grande.
 */
export function estimateDailyConsumption(
  movements: StockMovement[],
  asOfDate: string,
  windowDays: number
): DailyConsumptionEstimate {
  const windowStart = addDaysIso(asOfDate, -windowDays);
  const salidasEnVentana = movements.filter(
    (m) => m.direction === "salida" && m.date >= windowStart && m.date <= asOfDate
  );

  const distinctDays = new Set(salidasEnVentana.map((m) => m.date));

  if (distinctDays.size < MIN_DAYS_WITH_DATA_FOR_ESTIMATE) {
    return { value: 0, confidence: "insuficiente", daysWithData: distinctDays.size };
  }

  const totalSalidas = salidasEnVentana.reduce((total, m) => total + m.quantity, 0);
  const value = totalSalidas / windowDays;

  return { value, confidence: "estimado", daysWithData: distinctDays.size };
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Días de cobertura = stock actual / consumo diario estimado. Si el consumo
 * no tiene confianza suficiente, o es 0, la cobertura NO se calcula (null) --
 * mostrar "4 días" cuando en realidad no hay dato confiable sería
 * exactamente el tipo de número "aparentemente preciso pero incorrecto" que
 * el prompt original prohíbe.
 */
export function calculateCoverage(
  currentStock: number,
  consumption: DailyConsumptionEstimate
): CoverageResult {
  if (consumption.confidence === "insuficiente" || consumption.value <= 0) {
    return { days: null, confidence: "insuficiente" };
  }
  return { days: currentStock / consumption.value, confidence: consumption.confidence };
}

/**
 * Compra recomendada = lo que hace falta para cubrir el consumo proyectado a
 * `horizonDays` más el stock de seguridad, menos lo que ya hay.
 *
 * Si la confianza del consumo es insuficiente, igual se devuelve un
 * resultado (con priority='revisar' en vez de un cálculo de prioridad por
 * cobertura) -- no se oculta el producto de la lista de compras solo porque
 * falte historial, pero tampoco se le asigna una urgencia inventada.
 */
export function calculateRecommendedPurchase(params: {
  stockItemId: string;
  currentStock: number;
  consumption: DailyConsumptionEstimate;
  safetyStock: number;
  horizonDays: number;
}): RecommendedPurchase {
  const projectedConsumption = params.consumption.value * params.horizonDays;
  const neededQuantity = Math.max(
    0,
    projectedConsumption + params.safetyStock - params.currentStock
  );

  let priority: RecommendedPurchase["priority"];
  if (params.consumption.confidence === "insuficiente") {
    priority = "revisar";
  } else {
    const coverage = calculateCoverage(params.currentStock, params.consumption);
    if (coverage.days === null) priority = "revisar";
    else if (coverage.days < 3) priority = "alta";
    else if (coverage.days < 7) priority = "media";
    else priority = "baja";
  }

  return {
    stockItemId: params.stockItemId,
    currentStock: params.currentStock,
    projectedConsumption,
    safetyStock: params.safetyStock,
    neededQuantity,
    priority,
    confidence: params.consumption.confidence,
  };
}

/** Construye la lista de compras recomendadas para varios insumos a la vez. */
export function buildPurchaseRecommendations(params: {
  items: { stockItemId: string; currentStock: number; safetyStock: number }[];
  movementsByItem: Record<string, StockMovement[]>;
  asOfDate: string;
  consumptionWindowDays: number;
  purchaseHorizonDays: number;
}): RecommendedPurchase[] {
  return params.items.map((item) => {
    const consumption = estimateDailyConsumption(
      params.movementsByItem[item.stockItemId] ?? [],
      params.asOfDate,
      params.consumptionWindowDays
    );
    return calculateRecommendedPurchase({
      stockItemId: item.stockItemId,
      currentStock: item.currentStock,
      consumption,
      safetyStock: item.safetyStock,
      horizonDays: params.purchaseHorizonDays,
    });
  });
}

/** Ordena por prioridad (alta > media > baja > revisar) para mostrar primero lo más urgente. */
export function sortByPurchasePriority(recs: RecommendedPurchase[]): RecommendedPurchase[] {
  const order: Record<RecommendedPurchase["priority"], number> = {
    alta: 0,
    media: 1,
    baja: 2,
    revisar: 3,
  };
  return [...recs].sort((a, b) => order[a.priority] - order[b.priority]);
}

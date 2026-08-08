/**
 * Motor de objetivos — capa de servicios.
 *
 * Mismas reglas que el resto de los motores: funciones puras, sin Supabase,
 * sin I/O.
 *
 * Regla central (Sección 18 del prompt original): si el objetivo semanal es
 * $6.000.000 y van $3.200.000 con 4 días restantes, NO alcanza con dividir
 * lo que falta por los días que quedan -- si viernes/sábado concentran más
 * venta que el resto de la semana, un reparto lineal puede decir "no llegás"
 * cuando en realidad sí, o al revés. Por eso `projectGoalCompletion` usa el
 * promedio histórico por día de la semana cuando hay suficiente historial, y
 * el reparto lineal (`simpleRequiredDailyAverage`) queda solo como piso de
 * referencia, siempre calculable, nunca como la única respuesta.
 */

import type { GoalProgress, GoalProjection, DailySeriesPoint, ConfidenceLevel } from "../../types/domain";

const MIN_DATA_POINTS_FOR_WEEKDAY_PROJECTION = 14; // ~2 semanas

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(isoDate: string): number {
  return new Date(isoDate + "T00:00:00Z").getUTCDay(); // 0=domingo .. 6=sábado
}

/** Progreso simple: cuánto se lleva, cuánto falta, ritmo lineal de referencia. */
export function calculateGoalProgress(params: {
  targetValue: number;
  achievedValue: number;
  periodStart: string;
  periodEnd: string;
  asOfDate: string;
}): GoalProgress {
  const remaining = params.targetValue - params.achievedValue;
  const percentComplete = params.targetValue !== 0 ? params.achievedValue / params.targetValue : 0;

  const totalDays = daysBetweenInclusive(params.periodStart, params.periodEnd);
  const daysElapsed = Math.min(
    totalDays,
    Math.max(0, daysBetweenInclusive(params.periodStart, params.asOfDate))
  );
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  const simpleRequiredDailyAverage = daysRemaining > 0 ? Math.max(0, remaining) / daysRemaining : 0;

  return {
    targetValue: params.targetValue,
    achievedValue: params.achievedValue,
    remaining,
    percentComplete,
    daysElapsed,
    daysRemaining,
    simpleRequiredDailyAverage,
  };
}

/**
 * Promedio histórico de venta por día de la semana, a partir de una serie
 * diaria (ej. facturación de los últimos 60 días). Devuelve null si no hay
 * suficiente historial -- nunca "inventa" un patrón con pocos datos.
 */
export function computeHistoricalAverageByWeekday(
  series: DailySeriesPoint[]
): Record<number, number> | null {
  if (series.length < MIN_DATA_POINTS_FOR_WEEKDAY_PROJECTION) return null;

  const sums: Record<number, number> = {};
  const counts: Record<number, number> = {};
  for (const point of series) {
    const dow = weekdayOf(point.date);
    sums[dow] = (sums[dow] ?? 0) + point.value;
    counts[dow] = (counts[dow] ?? 0) + 1;
  }

  const overallAverage = series.reduce((t, p) => t + p.value, 0) / series.length;
  const result: Record<number, number> = {};
  for (let dow = 0; dow <= 6; dow++) {
    // Si un día de la semana no tiene ningún dato en la ventana (poco común
    // con 2+ semanas de historial, pero posible), se usa el promedio general
    // como aproximación -- documentado acá, no oculto.
    result[dow] = counts[dow] ? sums[dow] / counts[dow] : overallAverage;
  }
  return result;
}

/**
 * Proyecta si el objetivo sigue siendo alcanzable, usando el promedio
 * histórico por día de la semana para los días que quedan del período (en
 * vez de repartir linealmente). Si no hay suficiente historial, devuelve
 * confidence='insuficiente' y no afirma nada sobre alcanzabilidad.
 */
export function projectGoalCompletion(params: {
  progress: GoalProgress;
  periodEnd: string;
  asOfDate: string;
  historicalSeries: DailySeriesPoint[];
}): GoalProjection {
  if (params.progress.remaining <= 0) {
    return {
      progress: params.progress,
      confidence: "real",
      projectedRemainingTotal: 0,
      feasible: true,
      shortfall: null,
    };
  }

  if (params.progress.daysRemaining <= 0) {
    return {
      progress: params.progress,
      confidence: "real",
      projectedRemainingTotal: 0,
      feasible: false,
      shortfall: params.progress.remaining,
    };
  }

  const weekdayAverages = computeHistoricalAverageByWeekday(params.historicalSeries);
  if (!weekdayAverages) {
    return {
      progress: params.progress,
      confidence: "insuficiente",
      projectedRemainingTotal: null,
      feasible: null,
      shortfall: null,
    };
  }

  let projectedRemainingTotal = 0;
  let cursor = addDaysIso(params.asOfDate, 1);
  for (let i = 0; i < params.progress.daysRemaining; i++) {
    if (cursor > params.periodEnd) break;
    projectedRemainingTotal += weekdayAverages[weekdayOf(cursor)];
    cursor = addDaysIso(cursor, 1);
  }

  const feasible = projectedRemainingTotal >= params.progress.remaining;
  const shortfall = feasible ? null : params.progress.remaining - projectedRemainingTotal;

  return {
    progress: params.progress,
    confidence: "estimado",
    projectedRemainingTotal,
    feasible,
    shortfall,
  };
}

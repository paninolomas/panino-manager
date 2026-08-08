import { describe, it, expect } from "vitest";
import {
  calculateGoalProgress,
  computeHistoricalAverageByWeekday,
  projectGoalCompletion,
} from "../../lib/services/goals-engine";
import type { DailySeriesPoint } from "../../types/domain";

describe("calculateGoalProgress", () => {
  it("ejemplo del prompt original: objetivo $6M, actual $3.2M, 4 días restantes", () => {
    // 2026-08-10 es lunes; si el período es semana lun-dom (2026-08-10 a 2026-08-16)
    // y hoy es 2026-08-13 (jueves), quedan 3 días (vie/sáb/dom)... para que sean
    // EXACTAMENTE 4 restantes según el ejemplo, usamos asOfDate=2026-08-12 (miércoles).
    const progress = calculateGoalProgress({
      targetValue: 6000000,
      achievedValue: 3200000,
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
    });
    expect(progress.remaining).toBe(2800000);
    expect(progress.daysRemaining).toBe(4);
    expect(progress.simpleRequiredDailyAverage).toBe(700000); // 2.800.000 / 4
  });

  it("percentComplete puede superar 1 si ya se cumplió el objetivo", () => {
    const progress = calculateGoalProgress({
      targetValue: 1000,
      achievedValue: 1200,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      asOfDate: "2026-08-05",
    });
    expect(progress.percentComplete).toBeCloseTo(1.2, 4);
    expect(progress.remaining).toBe(-200);
  });

  it("daysRemaining nunca es negativo, aunque asOfDate sea posterior al período", () => {
    const progress = calculateGoalProgress({
      targetValue: 1000,
      achievedValue: 500,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-07",
      asOfDate: "2026-08-20",
    });
    expect(progress.daysRemaining).toBe(0);
    expect(progress.simpleRequiredDailyAverage).toBe(0); // no divide por 0
  });
});

describe("computeHistoricalAverageByWeekday -- nunca inventa un patrón con pocos datos", () => {
  it("con menos de 14 puntos, devuelve null", () => {
    const series: DailySeriesPoint[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      value: 100000,
    }));
    expect(computeHistoricalAverageByWeekday(series)).toBeNull();
  });

  it("con 14+ puntos, calcula el promedio por día de la semana", () => {
    // 4 semanas de datos, viernes y sábado con más venta que el resto
    const series: DailySeriesPoint[] = [];
    const start = new Date("2026-07-06T00:00:00Z"); // lunes
    for (let week = 0; week < 4; week++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + week * 7 + d);
        const dow = date.getUTCDay();
        const value = dow === 5 || dow === 6 ? 900000 : 400000; // vie/sáb más fuerte
        series.push({ date: date.toISOString().slice(0, 10), value });
      }
    }
    const averages = computeHistoricalAverageByWeekday(series);
    expect(averages).not.toBeNull();
    expect(averages![5]).toBeCloseTo(900000, 0); // viernes
    expect(averages![6]).toBeCloseTo(900000, 0); // sábado
    expect(averages![1]).toBeCloseTo(400000, 0); // lunes
  });
});

describe("projectGoalCompletion", () => {
  const weightedSeries: DailySeriesPoint[] = (() => {
    const series: DailySeriesPoint[] = [];
    const start = new Date("2026-07-06T00:00:00Z");
    for (let week = 0; week < 4; week++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + week * 7 + d);
        const dow = date.getUTCDay();
        const value = dow === 5 || dow === 6 ? 900000 : 400000;
        series.push({ date: date.toISOString().slice(0, 10), value });
      }
    }
    return series;
  })();

  it("sin historial suficiente, devuelve confidence='insuficiente' y no afirma alcanzabilidad", () => {
    const progress = calculateGoalProgress({
      targetValue: 6000000,
      achievedValue: 3200000,
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
    });
    const projection = projectGoalCompletion({
      progress,
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
      historicalSeries: [],
    });
    expect(projection.confidence).toBe("insuficiente");
    expect(projection.feasible).toBeNull();
    expect(projection.projectedRemainingTotal).toBeNull();
  });

  it("con historial ponderado, proyecta usando el promedio por día de la semana de los días restantes", () => {
    // período lun 10/8 a dom 16/8, hoy miércoles 12/8 -> quedan jue,vie,sáb,dom
    const progress = calculateGoalProgress({
      targetValue: 3000000,
      achievedValue: 1000000,
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
    });
    const projection = projectGoalCompletion({
      progress,
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
      historicalSeries: weightedSeries,
    });
    expect(projection.confidence).toBe("estimado");
    // jue(400k) + vie(900k) + sáb(900k) + dom(400k) = 2.600.000
    expect(projection.projectedRemainingTotal).toBeCloseTo(2600000, -3);
  });

  it("marca feasible=false y calcula el faltante cuando la proyección no alcanza", () => {
    const progress = calculateGoalProgress({
      targetValue: 10000000, // objetivo muy alto
      achievedValue: 1000000,
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
    });
    const projection = projectGoalCompletion({
      progress,
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
      historicalSeries: weightedSeries,
    });
    expect(projection.feasible).toBe(false);
    expect(projection.shortfall).toBeGreaterThan(0);
  });

  it("objetivo ya cumplido -> feasible=true sin necesitar proyección", () => {
    const progress = calculateGoalProgress({
      targetValue: 1000,
      achievedValue: 1500,
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
    });
    const projection = projectGoalCompletion({
      progress,
      periodEnd: "2026-08-16",
      asOfDate: "2026-08-12",
      historicalSeries: [],
    });
    expect(projection.feasible).toBe(true);
    expect(projection.confidence).toBe("real");
  });
});

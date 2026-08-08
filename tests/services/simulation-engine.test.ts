import { describe, it, expect } from "vitest";
import { runSimulation } from "../../lib/services/simulation-engine";
import type { SimulationBaseline, SimulationAdjustments } from "../../types/domain";

const baseline: SimulationBaseline = {
  unitsSold: 100,
  unitPrice: 19000,
  unitCost: 10200,
  commissionPercent: 0.2,
  fixedCosts: 300000,
};

const noChange: SimulationAdjustments = {
  priceDeltaPercent: 0,
  volumeDeltaPercent: 0,
  costDeltaPercent: 0,
};

describe("runSimulation -- escenario sin cambios", () => {
  it("simulado == actual cuando no hay ajustes", () => {
    const result = runSimulation(baseline, noChange);
    expect(result.simulated.revenue).toBeCloseTo(result.current.revenue, 2);
    expect(result.simulated.profit).toBeCloseTo(result.current.profit, 2);
    expect(result.delta.revenue).toBeCloseTo(0, 2);
  });

  it("calcula el escenario actual correctamente", () => {
    const result = runSimulation(baseline, noChange);
    expect(result.current.revenue).toBe(1900000); // 100 * 19000
    const netPrice = 19000 * 0.8;
    const unitProfit = netPrice - 10200;
    expect(result.current.profit).toBeCloseTo(unitProfit * 100 - 300000, 2);
  });
});

describe("runSimulation -- aumento de precio +10%", () => {
  it("sube el precio, la facturación y (si el volumen no cae) la ganancia", () => {
    const result = runSimulation(baseline, { priceDeltaPercent: 0.1, volumeDeltaPercent: 0, costDeltaPercent: 0 });
    expect(result.simulated.unitPrice).toBeCloseTo(20900, 2);
    expect(result.delta.revenue).toBeGreaterThan(0);
    expect(result.delta.profit).toBeGreaterThan(0);
  });
});

describe("runSimulation -- baja de ventas -10%", () => {
  it("reduce unidades vendidas y por lo tanto la ganancia total", () => {
    const result = runSimulation(baseline, { priceDeltaPercent: 0, volumeDeltaPercent: -0.1, costDeltaPercent: 0 });
    expect(result.simulated.unitsSold).toBeCloseTo(90, 2);
    expect(result.delta.profit).toBeLessThan(0);
  });
});

describe("runSimulation -- aumento de costos", () => {
  it("sube el costo unitario y baja el margen simulado", () => {
    const result = runSimulation(baseline, { priceDeltaPercent: 0, volumeDeltaPercent: 0, costDeltaPercent: 0.1 });
    expect(result.simulated.unitCost).toBeCloseTo(10200 * 1.1, 2);
    expect(result.delta.marginPercent).toBeLessThan(0);
  });
});

describe("runSimulation -- comisión reemplazada directamente", () => {
  it("usa commissionOverridePercent en vez de aplicar un delta", () => {
    const result = runSimulation(baseline, { ...noChange, commissionOverridePercent: 0.35 });
    expect(result.simulated.commissionPercent).toBe(0.35);
    expect(result.current.commissionPercent).toBe(0.2); // el actual no cambia
  });
});

describe("punto de equilibrio dentro del escenario", () => {
  it("es null si el producto no deja contribución positiva (costo unitario >= precio neto)", () => {
    const losingBaseline: SimulationBaseline = {
      unitsSold: 10,
      unitPrice: 5000,
      unitCost: 6000, // más caro que el precio de venta
      commissionPercent: 0,
      fixedCosts: 100000,
    };
    const result = runSimulation(losingBaseline, noChange);
    expect(result.current.breakEvenUnits).toBeNull();
  });

  it("es un número positivo cuando la contribución unitaria es positiva", () => {
    const result = runSimulation(baseline, noChange);
    expect(result.current.breakEvenUnits).not.toBeNull();
    expect(result.current.breakEvenUnits as number).toBeGreaterThan(0);
  });
});

describe("situación actual vs. simulada quedan siempre ambas disponibles", () => {
  it("nunca sobrescribe el escenario actual, aunque se apliquen ajustes grandes", () => {
    const result = runSimulation(baseline, { priceDeltaPercent: 0.5, volumeDeltaPercent: -0.5, costDeltaPercent: 0.5 });
    expect(result.current.unitPrice).toBe(19000);
    expect(result.current.unitsSold).toBe(100);
    expect(result.simulated.unitPrice).not.toBe(result.current.unitPrice);
  });
});

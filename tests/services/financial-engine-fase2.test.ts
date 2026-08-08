import { describe, it, expect } from "vitest";
import {
  calculateCommittedObligations,
  calculateCommittedCommissions,
  calculateProjectedRecurringExpenses,
  calculateExpectedInflows,
  calculateHorizonProjection,
  buildStandardHorizonProjections,
  simulatePedidosYaAdvance,
  recommendAdvanceDecision,
} from "../../lib/services/financial-engine";
import type { Obligation, CommissionCharge, ExpectedInflow, RecurringExpenseProjection } from "../../types/domain";

describe("calculateCommittedObligations", () => {
  const obligations: Obligation[] = [
    { id: "1", supplierId: "s1", amount: 50000, estimatedDueDate: "2026-08-10", status: "pending" },
    { id: "2", supplierId: "s1", amount: 30000, estimatedDueDate: "2026-08-20", status: "pending" },
    { id: "3", supplierId: "s1", amount: 10000, estimatedDueDate: "2026-08-05", status: "paid" },
  ];

  it("suma solo pendientes dentro del horizonte (inclusive)", () => {
    expect(calculateCommittedObligations(obligations, "2026-08-10")).toBe(50000);
  });

  it("ignora las pagadas aunque venzan dentro del horizonte", () => {
    expect(calculateCommittedObligations(obligations, "2026-08-05")).toBe(0);
  });

  it("incluye todo si el horizonte es lo suficientemente amplio", () => {
    expect(calculateCommittedObligations(obligations, "2026-08-31")).toBe(80000);
  });
});

describe("calculateCommittedCommissions", () => {
  const commissions: CommissionCharge[] = [
    { id: "c1", amount: 5000, estimatedPaymentDate: "2026-08-12", status: "pending" },
    { id: "c2", amount: 7000, estimatedPaymentDate: "2026-08-25", status: "pending" },
  ];

  it("respeta el horizonte igual que las obligaciones", () => {
    expect(calculateCommittedCommissions(commissions, "2026-08-12")).toBe(5000);
    expect(calculateCommittedCommissions(commissions, "2026-08-25")).toBe(12000);
  });
});

describe("calculateProjectedRecurringExpenses", () => {
  const templates: RecurringExpenseProjection[] = [
    { amount: 200000, dueDate: "2026-08-05" }, // alquiler
    { amount: 15000, dueDate: "2026-08-05" }, // internet
  ];

  it("suma las proyecciones dentro del horizonte", () => {
    expect(calculateProjectedRecurringExpenses(templates, "2026-08-05")).toBe(215000);
  });

  it("da 0 si ninguna cae dentro del horizonte", () => {
    expect(calculateProjectedRecurringExpenses(templates, "2026-08-01")).toBe(0);
  });
});

describe("calculateExpectedInflows", () => {
  const inflows: ExpectedInflow[] = [
    { id: "liq-1", amount: 600000, expectedDate: "2026-08-14" }, // viernes PedidosYa
    { id: "liq-2", amount: 250000, expectedDate: "2026-08-12" }, // miércoles Rappi
  ];

  it("suma cobros esperados dentro del horizonte", () => {
    expect(calculateExpectedInflows(inflows, "2026-08-12")).toBe(250000);
    expect(calculateExpectedInflows(inflows, "2026-08-14")).toBe(850000);
  });
});

describe("calculateHorizonProjection", () => {
  it("combina caja + cobros - comprometido - reserva", () => {
    const result = calculateHorizonProjection({
      asOfDate: "2026-08-10",
      horizonDays: 7,
      currentLiquidity: 500000,
      inflows: [{ id: "liq-1", amount: 300000, expectedDate: "2026-08-14" }],
      obligations: [{ id: "o1", supplierId: "s1", amount: 200000, estimatedDueDate: "2026-08-15", status: "pending" }],
      commissions: [],
      recurringExpenses: [],
      reserve: 100000,
    });

    expect(result.horizonDate).toBe("2026-08-17");
    expect(result.expectedInflows).toBe(300000);
    expect(result.committed).toBe(200000);
    expect(result.liquidityBeforeReserve).toBe(600000); // 500000 + 300000 - 200000
    expect(result.availableReal).toBe(500000); // - 100000 de reserva
  });

  it("un horizonte corto puede no alcanzar a capturar un cobro que sí capturaría uno largo", () => {
    const base = {
      asOfDate: "2026-08-10",
      currentLiquidity: 100000,
      inflows: [{ id: "liq-1", amount: 900000, expectedDate: "2026-08-14" }],
      obligations: [],
      commissions: [],
      recurringExpenses: [],
      reserve: 0,
    };
    const short = calculateHorizonProjection({ ...base, horizonDays: 3 });
    const long = calculateHorizonProjection({ ...base, horizonDays: 7 });

    expect(short.expectedInflows).toBe(0);
    expect(long.expectedInflows).toBe(900000);
  });
});

describe("buildStandardHorizonProjections", () => {
  it("genera exactamente los 5 horizontes del producto: 0, 3, 7, 14, 30", () => {
    const results = buildStandardHorizonProjections({
      asOfDate: "2026-08-10",
      currentLiquidity: 100000,
      inflows: [],
      obligations: [],
      commissions: [],
      recurringExpenses: [],
      reserve: 0,
    });
    expect(results.map((r) => r.horizonDays)).toEqual([0, 3, 7, 14, 30]);
  });
});

describe("simulatePedidosYaAdvance", () => {
  it("calcula el costo del adelanto con parámetros configurables (nunca 3%+IVA fijo)", () => {
    const sim = simulatePedidosYaAdvance({
      netReceivable: 1000000,
      normalPaymentDate: "2026-08-14",
      advanceDate: "2026-08-11",
      advanceFeePercent: 0.03,
      vatPercent: 0.21,
    });

    expect(sim.netReceivableIfWait).toBe(1000000);
    expect(sim.costPercentApplied).toBeCloseTo(0.0363, 6); // 3% * 1.21
    expect(sim.advanceCost).toBeCloseTo(36300, 2);
    expect(sim.netReceivableIfAdvance).toBeCloseTo(963700, 2);
  });

  it("distintos parámetros dan distinto costo -- no hay un 3% hardcodeado", () => {
    const simA = simulatePedidosYaAdvance({
      netReceivable: 1000000,
      normalPaymentDate: "2026-08-14",
      advanceDate: "2026-08-11",
      advanceFeePercent: 0.05,
      vatPercent: 0.21,
    });
    const simB = simulatePedidosYaAdvance({
      netReceivable: 1000000,
      normalPaymentDate: "2026-08-14",
      advanceDate: "2026-08-11",
      advanceFeePercent: 0.02,
      vatPercent: 0.21,
    });
    expect(simA.advanceCost).toBeGreaterThan(simB.advanceCost);
  });
});

describe("recommendAdvanceDecision", () => {
  const sim = simulatePedidosYaAdvance({
    netReceivable: 1000000,
    normalPaymentDate: "2026-08-14",
    advanceDate: "2026-08-11",
    advanceFeePercent: 0.03,
    vatPercent: 0.21,
  });

  it("recomienda ESPERAR cuando no hay riesgo de déficit de caja", () => {
    const rec = recommendAdvanceDecision({ simulation: sim, projectedAvailableBeforeNormalDate: 200000 });
    expect(rec.decision).toBe("wait");
    expect(rec.reason).toMatch(/ahorra/i);
  });

  it("recomienda ADELANTAR cuando el disponible proyectado antes del cobro normal es negativo", () => {
    const rec = recommendAdvanceDecision({ simulation: sim, projectedAvailableBeforeNormalDate: -50000 });
    expect(rec.decision).toBe("advance");
    expect(rec.reason).toMatch(/déficit/i);
  });

  it("nunca aplica una regla fija -- la misma simulación da resultados distintos según el contexto de caja", () => {
    const recWait = recommendAdvanceDecision({ simulation: sim, projectedAvailableBeforeNormalDate: 1 });
    const recAdvance = recommendAdvanceDecision({ simulation: sim, projectedAvailableBeforeNormalDate: -1 });
    expect(recWait.decision).not.toBe(recAdvance.decision);
  });
});

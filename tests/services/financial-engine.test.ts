import { describe, it, expect } from "vitest";
import {
  calculateAccountBalance,
  calculateBalancesByAccount,
  calculateTotalLiquidity,
  calculatePendingObligationsTotal,
  calculateSimpleAvailable,
} from "../../lib/services/financial-engine";
import type { CashMovement, Obligation } from "../../types/domain";

const movement = (
  overrides: Partial<CashMovement> & Pick<CashMovement, "accountId" | "amount" | "direction">
): CashMovement => ({
  id: crypto.randomUUID(),
  date: "2026-08-01",
  originType: "manual_adjustment",
  ...overrides,
});

describe("calculateAccountBalance", () => {
  it("suma ingresos y resta egresos", () => {
    const movements = [
      movement({ accountId: "efectivo", amount: 100000, direction: "ingreso" }),
      movement({ accountId: "efectivo", amount: 30000, direction: "egreso" }),
      movement({ accountId: "efectivo", amount: 5000, direction: "egreso" }),
    ];
    expect(calculateAccountBalance(movements)).toBe(65000);
  });

  it("devuelve 0 sin movimientos", () => {
    expect(calculateAccountBalance([])).toBe(0);
  });

  it("nunca lee un saldo editado a mano -- siempre deriva de la suma", () => {
    // Este test documenta la regla central del sistema: no existe un campo
    // "balance" editable, todo pasa por esta función sobre los movimientos reales.
    const movements = [
      movement({ accountId: "banco", amount: 500000, direction: "ingreso", originType: "opening_balance" }),
    ];
    expect(calculateAccountBalance(movements)).toBe(500000);
  });
});

describe("calculateBalancesByAccount", () => {
  it("agrupa correctamente por cuenta", () => {
    const movements = [
      movement({ accountId: "efectivo", amount: 100000, direction: "ingreso" }),
      movement({ accountId: "banco", amount: 200000, direction: "ingreso" }),
      movement({ accountId: "efectivo", amount: 20000, direction: "egreso" }),
    ];
    expect(calculateBalancesByAccount(movements)).toEqual({
      efectivo: 80000,
      banco: 200000,
    });
  });
});

describe("calculateTotalLiquidity", () => {
  it("suma todas las cuentas sin importar cuál sea", () => {
    const movements = [
      movement({ accountId: "efectivo", amount: 50000, direction: "ingreso" }),
      movement({ accountId: "banco", amount: 150000, direction: "ingreso" }),
      movement({ accountId: "mercado_pago", amount: 10000, direction: "egreso" }),
    ];
    expect(calculateTotalLiquidity(movements)).toBe(190000);
  });
});

describe("calculatePendingObligationsTotal", () => {
  const obligations: Obligation[] = [
    { id: "1", supplierId: "sup-1", amount: 40000, estimatedDueDate: "2026-08-15", status: "pending" },
    { id: "2", supplierId: "sup-1", amount: 60000, estimatedDueDate: "2026-08-20", status: "pending" },
    { id: "3", supplierId: "sup-2", amount: 25000, estimatedDueDate: "2026-08-10", status: "paid" },
  ];

  it("solo suma las obligaciones pendientes, ignora las pagadas", () => {
    expect(calculatePendingObligationsTotal(obligations)).toBe(100000);
  });

  it("devuelve 0 si no hay obligaciones pendientes", () => {
    const allPaid = obligations.map((o) => ({ ...o, status: "paid" as const }));
    expect(calculatePendingObligationsTotal(allPaid)).toBe(0);
  });
});

describe("calculateSimpleAvailable", () => {
  it("resta lo comprometido a la liquidez total", () => {
    const movements = [
      movement({ accountId: "efectivo", amount: 300000, direction: "ingreso" }),
    ];
    const obligations: Obligation[] = [
      { id: "1", supplierId: "sup-1", amount: 120000, estimatedDueDate: "2026-08-15", status: "pending" },
    ];
    expect(calculateSimpleAvailable(movements, obligations)).toBe(180000);
  });

  it("puede dar negativo -- señal de riesgo de caja que el motor de recomendaciones (Fase 2) usará", () => {
    const movements = [
      movement({ accountId: "efectivo", amount: 50000, direction: "ingreso" }),
    ];
    const obligations: Obligation[] = [
      { id: "1", supplierId: "sup-1", amount: 200000, estimatedDueDate: "2026-08-15", status: "pending" },
    ];
    expect(calculateSimpleAvailable(movements, obligations)).toBe(-150000);
  });
});

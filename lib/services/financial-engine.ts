/**
 * Motor financiero — capa de servicios.
 *
 * Reglas de esta capa (no negociables):
 *  - Funciones puras: no importan Supabase ni Next.js, no hacen I/O.
 *  - Reciben datos ya leídos por un repositorio, devuelven resultados.
 *  - El Copiloto (Fase 5) solo puede citar números que salgan de acá.
 *
 * Alcance de Fase 1: derivar saldos desde movimientos (regla central del
 * sistema: "ningún saldo se edita directo") y un total de liquidez simple.
 * El motor financiero completo (por cobrar, comprometido con horizontes,
 * disponible real, adelanto de PedidosYa) se implementa en Fase 2 -- acá
 * solo se deja la base que ese motor va a reutilizar sin cambios de forma.
 */

import type {
  CashMovement,
  Obligation,
  CommissionCharge,
  ExpectedInflow,
  RecurringExpenseProjection,
  HorizonProjection,
  PedidosYaAdvanceSimulation,
  AdvanceRecommendation,
} from "../../types/domain";

/** Saldo de una cuenta = SUM(ingresos) - SUM(egresos) de sus movimientos. */
export function calculateAccountBalance(movements: CashMovement[]): number {
  return movements.reduce((total, m) => {
    return m.direction === "ingreso" ? total + m.amount : total - m.amount;
  }, 0);
}

/** Saldo por cuenta, agrupando una lista de movimientos de varias cuentas. */
export function calculateBalancesByAccount(
  movements: CashMovement[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const m of movements) {
    const current = balances[m.accountId] ?? 0;
    balances[m.accountId] =
      m.direction === "ingreso" ? current + m.amount : current - m.amount;
  }
  return balances;
}

/** Liquidez total = suma de los saldos de todas las cuentas. */
export function calculateTotalLiquidity(movements: CashMovement[]): number {
  return calculateAccountBalance(movements);
}

/**
 * Suma simple de obligaciones pendientes (sin proyección por horizonte).
 * En Fase 2 esto se reemplaza por "Comprometido(horizonte)" del addendum v2,
 * que además incorpora recurring expenses y comisiones pendientes.
 */
export function calculatePendingObligationsTotal(
  obligations: Obligation[]
): number {
  return obligations
    .filter((o) => o.status === "pending")
    .reduce((total, o) => total + o.amount, 0);
}

/**
 * Diferencia entre lo que hay en caja y lo comprometido (versión simple,
 * sin reserva todavía -- reserve_targets se lee pero el descuento de reserva
 * se activa recién cuando exista UI para configurarla, Fase 2).
 */
export function calculateSimpleAvailable(
  movements: CashMovement[],
  obligations: Obligation[]
): number {
  return (
    calculateTotalLiquidity(movements) -
    calculatePendingObligationsTotal(obligations)
  );
}

/* ------------------------------------------------------------------ */
/*  Fase 2 -- motor financiero completo                                */
/* ------------------------------------------------------------------ */

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Suma de obligaciones pendientes cuyo vencimiento cae dentro del horizonte (inclusive). */
export function calculateCommittedObligations(
  obligations: Obligation[],
  horizonDate: string
): number {
  return obligations
    .filter((o) => o.status === "pending" && o.estimatedDueDate <= horizonDate)
    .reduce((total, o) => total + o.amount, 0);
}

/** Suma de comisiones pendientes (ej. Pedix) cuyo pago estimado cae dentro del horizonte. */
export function calculateCommittedCommissions(
  commissions: CommissionCharge[],
  horizonDate: string
): number {
  return commissions
    .filter((c) => c.status === "pending" && c.estimatedPaymentDate <= horizonDate)
    .reduce((total, c) => total + c.amount, 0);
}

/** Suma de gastos recurrentes proyectados dentro del horizonte (una ocurrencia por vencimiento). */
export function calculateProjectedRecurringExpenses(
  templates: RecurringExpenseProjection[],
  horizonDate: string
): number {
  return templates
    .filter((t) => t.dueDate <= horizonDate)
    .reduce((total, t) => total + t.amount, 0);
}

/** Suma de cobros esperados (liquidaciones pendientes) dentro del horizonte. */
export function calculateExpectedInflows(
  inflows: ExpectedInflow[],
  horizonDate: string
): number {
  return inflows
    .filter((i) => i.expectedDate <= horizonDate)
    .reduce((total, i) => total + i.amount, 0);
}

/**
 * Disponible real proyectado a un horizonte de días, según la fórmula
 * del addendum v2 (ajuste #3, aprobado):
 *
 *   DisponibleReal(horizonte) = Caja hoy
 *                              + Cobros esperados dentro del horizonte
 *                              - Comprometido dentro del horizonte
 *                              - Reserva
 *
 * "Comprometido" agrupa obligaciones a proveedores + comisiones pendientes +
 * gastos recurrentes proyectados -- se le pasan ya sumados porque cada uno
 * tiene su propia fuente de datos (parámetro `committed`), para no acoplar
 * esta función a las tres formas de "compromiso" por separado.
 */
export function calculateHorizonProjection(params: {
  asOfDate: string;
  horizonDays: number;
  currentLiquidity: number;
  inflows: ExpectedInflow[];
  obligations: Obligation[];
  commissions: CommissionCharge[];
  recurringExpenses: RecurringExpenseProjection[];
  reserve: number;
}): HorizonProjection {
  const horizonDate = addDays(params.asOfDate, params.horizonDays);

  const expectedInflows = calculateExpectedInflows(params.inflows, horizonDate);
  const committed =
    calculateCommittedObligations(params.obligations, horizonDate) +
    calculateCommittedCommissions(params.commissions, horizonDate) +
    calculateProjectedRecurringExpenses(params.recurringExpenses, horizonDate);

  const liquidityBeforeReserve = params.currentLiquidity + expectedInflows - committed;

  return {
    horizonDays: params.horizonDays,
    horizonDate,
    expectedInflows,
    committed,
    liquidityBeforeReserve,
    reserve: params.reserve,
    availableReal: liquidityBeforeReserve - params.reserve,
  };
}

/** Construye la proyección para los horizontes estándar del producto: hoy, 3, 7, 14, 30 días. */
export function buildStandardHorizonProjections(
  params: Omit<Parameters<typeof calculateHorizonProjection>[0], "horizonDays">
): HorizonProjection[] {
  return [0, 3, 7, 14, 30].map((horizonDays) =>
    calculateHorizonProjection({ ...params, horizonDays })
  );
}

/**
 * Simulador de adelanto de PedidosYa (Sección 5 del prompt original, ajuste
 * del addendum v2: el % de costo NUNCA es fijo, siempre viene por parámetro).
 *
 * costPercentApplied = feePercent * (1 + vatPercent) -- ej. 3% + IVA 21%
 * sobre ese 3% = 3% * 1.21 = 3.63% efectivo sobre el monto adelantado.
 */
export function simulatePedidosYaAdvance(params: {
  netReceivable: number;
  normalPaymentDate: string;
  advanceDate: string;
  advanceFeePercent: number; // ej. 0.03
  vatPercent: number; // ej. 0.21
}): PedidosYaAdvanceSimulation {
  const costPercentApplied = params.advanceFeePercent * (1 + params.vatPercent);
  const advanceCost = params.netReceivable * costPercentApplied;

  return {
    netReceivableIfWait: params.netReceivable,
    waitDate: params.normalPaymentDate,
    netReceivableIfAdvance: params.netReceivable - advanceCost,
    advanceDate: params.advanceDate,
    advanceCost,
    costPercentApplied,
  };
}

/**
 * Recomendación de adelantar o esperar. NO es una regla fija ("siempre
 * adelantar" / "nunca adelantar", explícitamente prohibido en el prompt
 * original) -- compara la liquidez proyectada antes de la fecha normal de
 * cobro contra la reserva mínima. Si hay déficit, recomienda adelantar aunque
 * tenga costo financiero; si no, recomienda esperar y muestra el ahorro.
 */
export function recommendAdvanceDecision(params: {
  simulation: PedidosYaAdvanceSimulation;
  projectedAvailableBeforeNormalDate: number; // Disponible real proyectado a la fecha de cobro normal, SIN contar este cobro
}): AdvanceRecommendation {
  if (params.projectedAvailableBeforeNormalDate < 0) {
    return {
      decision: "advance",
      reason: `Sin adelantar, el disponible proyectado antes del ${params.simulation.waitDate} caería a ${params.projectedAvailableBeforeNormalDate.toFixed(2)} (por debajo de cero). Adelantar cuesta ${params.simulation.advanceCost.toFixed(2)}, pero evita el déficit de caja.`,
    };
  }
  return {
    decision: "wait",
    reason: `El disponible proyectado antes del ${params.simulation.waitDate} se mantiene en ${params.projectedAvailableBeforeNormalDate.toFixed(2)} sin necesidad de adelantar. Esperar ahorra ${params.simulation.advanceCost.toFixed(2)} de costo financiero.`,
  };
}

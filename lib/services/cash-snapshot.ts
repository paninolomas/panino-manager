import { listAccounts } from "../repositories/accounts.repo";
import { listMovements } from "../repositories/movements.repo";
import { listObligations } from "../repositories/suppliers.repo";
import { listExpectedInflows, listPendingCommissionsForEngine } from "../repositories/settlements.repo";
import { listCommittedExpenses, ensureRecurringExpensesGenerated } from "../repositories/expenses.repo";
import { getActiveReserveTarget } from "../repositories/reserve.repo";
import { calculateTotalLiquidity, buildStandardHorizonProjections, calculateHorizonProjection } from "../services/financial-engine";

/**
 * Arma todo lo que necesita el motor financiero para proyectar horizontes,
 * en un solo lugar -- el dashboard y el Copiloto (Fase 6) usan exactamente
 * esta misma función, así nunca pueden mostrar números distintos para la
 * misma pregunta.
 *
 * Fase 23b: "comprometido" por gastos fijos/recurrentes se lee ahora de los
 * gastos REALES con fecha estimada de pago cargada (listCommittedExpenses),
 * no de la proyección teórica de plantillas (listRecurringExpenseProjections,
 * que se sigue usando solo en el Simulador). Motivo: la proyección no se
 * entera si el usuario editó el monto de ese mes, y contar las dos fuentes
 * a la vez duplicaría el gasto. Se llama a ensureRecurringExpensesGenerated
 * acá (no solo en la página de Gastos) para que un gasto fijo del mes no
 * desaparezca del horizonte solo porque todavía no se abrió Gastos este mes.
 */
export async function getCashSnapshotInputs(asOfDate: string) {
  await ensureRecurringExpensesGenerated(asOfDate);

  const [accounts, movements, obligations, inflows, commissions, committedExpenses, reserve] = await Promise.all([
    listAccounts(),
    listMovements(),
    listObligations(),
    listExpectedInflows(),
    listPendingCommissionsForEngine(),
    listCommittedExpenses(),
    getActiveReserveTarget(),
  ]);

  const currentLiquidity = calculateTotalLiquidity(movements);

  return { accounts, movements, obligations, inflows, commissions, recurring: committedExpenses, reserve, currentLiquidity };
}

export async function getStandardHorizons(asOfDate: string) {
  const inputs = await getCashSnapshotInputs(asOfDate);
  const horizons = buildStandardHorizonProjections({
    asOfDate,
    currentLiquidity: inputs.currentLiquidity,
    inflows: inputs.inflows,
    obligations: inputs.obligations,
    commissions: inputs.commissions,
    recurringExpenses: inputs.recurring,
    reserve: inputs.reserve,
  });
  return { horizons, inputs };
}

/** Proyección a un horizonte arbitrario en días (lo usa el simulador de adelanto del Copiloto). */
export async function getHorizonProjectionForDays(asOfDate: string, horizonDays: number) {
  const inputs = await getCashSnapshotInputs(asOfDate);
  return calculateHorizonProjection({
    asOfDate,
    horizonDays,
    currentLiquidity: inputs.currentLiquidity,
    inflows: inputs.inflows,
    obligations: inputs.obligations,
    commissions: inputs.commissions,
    recurringExpenses: inputs.recurring,
    reserve: inputs.reserve,
  });
}

import { listAccounts } from "../repositories/accounts.repo";
import { listMovements } from "../repositories/movements.repo";
import { listObligations } from "../repositories/suppliers.repo";
import { listExpectedInflows, listPendingCommissionsForEngine } from "../repositories/settlements.repo";
import { listRecurringExpenseProjections } from "../repositories/expenses.repo";
import { getActiveReserveTarget } from "../repositories/reserve.repo";
import { calculateTotalLiquidity, buildStandardHorizonProjections, calculateHorizonProjection } from "../services/financial-engine";

/**
 * Arma todo lo que necesita el motor financiero para proyectar horizontes,
 * en un solo lugar -- el dashboard y el Copiloto (Fase 6) usan exactamente
 * esta misma función, así nunca pueden mostrar números distintos para la
 * misma pregunta.
 */
export async function getCashSnapshotInputs(asOfDate: string) {
  const [accounts, movements, obligations, inflows, commissions, recurring, reserve] = await Promise.all([
    listAccounts(),
    listMovements(),
    listObligations(),
    listExpectedInflows(),
    listPendingCommissionsForEngine(),
    listRecurringExpenseProjections(asOfDate),
    getActiveReserveTarget(),
  ]);

  const currentLiquidity = calculateTotalLiquidity(movements);

  return { accounts, movements, obligations, inflows, commissions, recurring, reserve, currentLiquidity };
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

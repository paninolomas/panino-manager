import { listGoals, getGoalAchievedValue, getDailyRevenueSeries } from "../../../lib/repositories/goals.repo";
import { requireSocio } from "../../../lib/auth/session";
import { calculateGoalProgress, projectGoalCompletion } from "../../../lib/services/goals-engine";
import { NewGoalForm, GoalActions } from "../../../components/domain/GoalForms";

function formatValue(variable: string, n: number) {
  if (variable === "margen") return `${(n * 100).toFixed(1)}%`;
  if (variable === "pedidos") return n.toFixed(0);
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

const VARIABLE_LABEL: Record<string, string> = {
  facturacion: "Facturación",
  ganancia: "Ganancia",
  pedidos: "Pedidos",
  ticket_promedio: "Ticket promedio",
  margen: "Margen",
  caja: "Caja",
  ahorro: "Ahorro",
};

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function GoalsPage() {
  await requireSocio();
  const goals = await listGoals();
  const asOfDate = new Date().toISOString().slice(0, 10);

  const goalsWithProgress = await Promise.all(
    goals.map(async (goal) => {
      const achievedValue = await getGoalAchievedValue(goal, asOfDate);
      const progress = calculateGoalProgress({
        targetValue: goal.targetValue,
        achievedValue,
        periodStart: goal.periodStart,
        periodEnd: goal.periodEnd,
        asOfDate,
      });

      // Solo 'facturacion' tiene ponderación por día de la semana en Fase 5
      // (es la única con serie diaria confiable vía orders -- ver goals.repo.ts).
      let projection = null;
      if (goal.variable === "facturacion") {
        const historyStart = addDaysIso(goal.periodStart, -60);
        const historicalSeries = await getDailyRevenueSeries(historyStart, addDaysIso(goal.periodStart, -1));
        projection = projectGoalCompletion({
          progress,
          periodEnd: goal.periodEnd,
          asOfDate,
          historicalSeries,
        });
      }

      return { goal, progress, projection };
    })
  );

  return (
    <div className="stack">
      <h1>Objetivos</h1>

      {goalsWithProgress.length === 0 && (
        <section className="card">
          <p style={{ color: "var(--ink-soft)" }}>No hay objetivos cargados todavía.</p>
        </section>
      )}

      {goalsWithProgress.map(({ goal, progress, projection }) => (
        <section key={goal.id} className="card stack">
          <div className="row">
            <span className="label">
              {VARIABLE_LABEL[goal.variable]} · {goal.type === "weekly" ? "semanal" : goal.type === "monthly" ? "mensual" : "anual"}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {goal.periodStart} → {goal.periodEnd}
            </span>
          </div>

          <GoalActions goalId={goal.id} targetValue={goal.targetValue} periodStart={goal.periodStart} periodEnd={goal.periodEnd} />

          <div className="row">
            <span className="value-lg">{formatValue(goal.variable, progress.achievedValue)}</span>
            <span style={{ color: "var(--ink-soft)" }}>de {formatValue(goal.variable, progress.targetValue)}</span>
          </div>

          <div style={{ background: "var(--line)", height: 6, borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progress.percentComplete * 100))}%`,
                background: progress.percentComplete >= 1 ? "var(--positive)" : "var(--accent)",
                height: "100%",
              }}
            />
          </div>

          <div className="row" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            <span>Faltan {progress.daysRemaining} días</span>
            <span>Ritmo lineal necesario: {formatValue(goal.variable, progress.simpleRequiredDailyAverage)}/día</span>
          </div>

          {projection && (
            <>
              <hr className="ticket-rule" />
              {projection.confidence === "insuficiente" ? (
                <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                  No hay información suficiente para proyectar con historial ponderado (hace falta
                  al menos ~2 semanas de ventas registradas antes del período). Usá el ritmo lineal
                  de arriba como referencia.
                </p>
              ) : (
                <p style={{ fontSize: 13, color: projection.feasible ? "var(--positive)" : "var(--risk)" }}>
                  {projection.feasible
                    ? `Con el ritmo histórico por día de la semana, el objetivo es alcanzable (proyectado: ${formatValue("facturacion", projection.projectedRemainingTotal ?? 0)} en lo que resta).`
                    : `Con el ritmo histórico por día de la semana, faltarían aproximadamente ${formatValue("facturacion", projection.shortfall ?? 0)} para llegar.`}
                </p>
              )}
            </>
          )}
        </section>
      ))}

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Nuevo objetivo</h2>
        <NewGoalForm />
      </section>
    </div>
  );
}

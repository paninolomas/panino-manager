import { listRecurringExpenseProjections } from "../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../lib/auth/session";
import { SimulatorForm } from "../../../components/domain/SimulatorForm";

export default async function SimulatorPage() {
  await requireSocio();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const recurring = await listRecurringExpenseProjections(asOfDate);
  const defaultFixedCosts = recurring.reduce((t, r) => t + r.amount, 0);

  return (
    <div className="stack">
      <h1>¿Qué pasa si…?</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Cargá un escenario base (unidades, precio, costo, comisión, costos fijos del período) y
        probá combinaciones de precio/ventas/costos/comisión. El cálculo es instantáneo y corre
        en tu navegador — no modifica ningún dato real.
      </p>
      <section className="card">
        <SimulatorForm defaultFixedCosts={defaultFixedCosts} />
      </section>
    </div>
  );
}

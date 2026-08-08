import { listExpenseCategories, listExpenses } from "../../../lib/repositories/expenses.repo";
import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { NewExpenseForm, PayExpenseButton } from "../../../components/domain/ExpenseForms";
import { requireSocio } from "../../../lib/auth/session";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function ExpensesPage() {
  await requireSocio();
  const [categories, expenses, accounts] = await Promise.all([
    listExpenseCategories(),
    listExpenses(),
    listAccounts(),
  ]);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="stack">
      <h1>Gastos</h1>

      <section className="card stack">
        <div className="label">Pendientes de pago</div>
        {expenses.filter((e) => e.status === "pending").length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>No hay gastos pendientes.</p>
        )}
        {expenses
          .filter((e) => e.status === "pending")
          .map((e) => (
            <div key={e.id} className="row" style={{ alignItems: "center" }}>
              <span>
                {e.description} · <span style={{ color: "var(--ink-soft)" }}>{categoryName(e.category_id)}</span>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="figure">{formatARS(Number(e.amount))}</span>
                <PayExpenseButton expenseId={e.id} accounts={accounts} />
              </span>
            </div>
          ))}
      </section>

      <section className="card stack">
        <div className="label">Historial</div>
        {expenses
          .filter((e) => e.status === "paid")
          .slice(0, 20)
          .map((e) => (
            <div key={e.id} className="row">
              <span>{e.description}</span>
              <span className="figure" style={{ color: "var(--ink-soft)" }}>
                {formatARS(Number(e.amount))}
              </span>
            </div>
          ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Nuevo gasto</h2>
        <NewExpenseForm categories={categories} />
      </section>
    </div>
  );
}

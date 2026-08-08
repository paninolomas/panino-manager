import { listExpenseCategories, listExpenses } from "../../../lib/repositories/expenses.repo";
import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { NewExpenseForm, ExpenseRow, ExpenseCategoriesManager } from "../../../components/domain/ExpenseForms";
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
            <ExpenseRow
              key={e.id}
              expense={{ id: e.id, description: e.description, amount: Number(e.amount), date: e.date, category_id: e.category_id }}
              categoryName={categoryName(e.category_id)}
              categories={categories}
              accounts={accounts}
            />
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

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Categorías de gasto</h2>
        <ExpenseCategoriesManager categories={categories} />
      </section>
    </div>
  );
}

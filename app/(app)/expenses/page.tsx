import { listExpenseCategories, listExpenses, ensureRecurringExpensesGenerated } from "../../../lib/repositories/expenses.repo";
import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { NewExpenseForm, ExpenseRow, ExpenseCategoriesManager, PaidExpenseRow } from "../../../components/domain/ExpenseForms";
import { requireSocio } from "../../../lib/auth/session";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function ExpensesPage() {
  await requireSocio();
  // Fase 21: idempotente -- si a algún gasto fijo marcado le falta la
  // ocurrencia de este mes, se genera acá antes de listar. No hace nada si
  // ya está generado (ver generate_recurring_expenses en 0045).
  await ensureRecurringExpensesGenerated(new Date().toISOString().slice(0, 10));

  const [categories, expenses, accounts] = await Promise.all([
    listExpenseCategories(),
    listExpenses(),
    listAccounts(),
  ]);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const pending = expenses.filter((e) => e.status === "pending");
  const pendingTotal = pending.reduce((t, e) => t + Number(e.amount), 0);

  return (
    <div className="stack">
      <h1>Gastos</h1>

      <section className="card stack">
        <div className="row" style={{ alignItems: "baseline" }}>
          <div className="label">Pendientes de pago</div>
          {pending.length > 0 && <span className="figure">{formatARS(pendingTotal)}</span>}
        </div>
        {pending.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay gastos pendientes.</p>}
        {pending.map((e) => (
          <ExpenseRow
            key={e.id}
            expense={{
              id: e.id,
              description: e.description,
              amount: Number(e.amount),
              date: e.date,
              category_id: e.category_id,
              recurring_template_id: e.recurring_template_id,
            }}
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
            <PaidExpenseRow
              key={e.id}
              expense={{ id: e.id, description: e.description, amount: Number(e.amount), date: e.date, category_id: e.category_id }}
              categoryName={categoryName(e.category_id)}
            />
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

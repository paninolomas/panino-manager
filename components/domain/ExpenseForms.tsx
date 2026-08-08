"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";

type Category = { id: string; name: string; type: string };
type Account = { id: string; name: string };
type Expense = { id: string; description: string; amount: number; date: string; category_id: string };

/** Fila de gasto PENDIENTE con editar + el botón de pagar que ya existía. Solo pendientes -- pagado es inmutable por trigger (0005), ni se muestra el editar. */
export function ExpenseRow({
  expense,
  categoryName,
  categories,
  accounts,
}: {
  expense: Expense;
  categoryName: string;
  categories: Category[];
  accounts: Account[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(String(expense.amount));
  const [categoryId, setCategoryId] = useState(expense.category_id);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const result = await apiAction(`/api/expenses/${expense.id}`, "PATCH", {
      description,
      amount: Number(amount),
      categoryId,
    });
    if (!result.ok) return setError(result.error ?? null);
    setEditing(false);
    router.refresh();
  }

  function formatARS(n: number) {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  }

  if (editing) {
    return (
      <div className="stack" style={{ paddingBottom: 8 }}>
        {error && <div className="error-banner">{error}</div>}
        <div className="row" style={{ gap: 8 }}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ flex: 1 }} />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 110 }} />
          <button className="btn" type="button" onClick={save}>
            Guardar
          </button>
          <button className="btn-secondary" type="button" onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="row" style={{ alignItems: "center" }}>
      <span>
        {expense.description} · <span style={{ color: "var(--ink-soft)" }}>{categoryName}</span>
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="figure">{formatARS(expense.amount)}</span>
        <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => setEditing(true)}>
          Editar
        </button>
        <PayExpenseButton expenseId={expense.id} accounts={accounts} />
      </span>
    </div>
  );
}

/** Alta + edición + desactivar de categorías de gasto. Sin borrado real -- expenses referencia category_id por FK. */
export function ExpenseCategoriesManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"variable" | "fijo" | "personal">("variable");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await apiAction("/api/expense-categories", "POST", { name, type });
    setLoading(false);
    if (!result.ok) return setError(result.error ?? null);
    setName("");
    router.refresh();
  }

  async function saveEdit(id: string) {
    const result = await apiAction(`/api/expense-categories/${id}`, "PATCH", { name: editName });
    if (!result.ok) return setError(result.error ?? null);
    setEditingId(null);
    router.refresh();
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar esta categoría? Los gastos ya cargados con ella no se tocan.")) return;
    const result = await apiAction(`/api/expense-categories/${id}`, "PATCH", { active: false });
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {categories.map((c) =>
        editingId === c.id ? (
          <div key={c.id} className="row" style={{ gap: 8 }}>
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn" type="button" onClick={() => saveEdit(c.id)}>
              Guardar
            </button>
            <button className="btn-secondary" type="button" onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div key={c.id} className="row">
            <span>{c.name}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="pill">{c.type}</span>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: 13 }}
                type="button"
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                }}
              >
                Editar
              </button>
              <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => deactivate(c.id)}>
                Desactivar
              </button>
            </span>
          </div>
        )
      )}
      <hr className="ticket-rule" />
      <form onSubmit={create} className="row" style={{ gap: 8 }}>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" style={{ flex: 1 }} />
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="variable">Variable</option>
          <option value="fijo">Fijo</option>
          <option value="personal">Personal</option>
        </select>
        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Creando…" : "Agregar"}
        </button>
      </form>
    </div>
  );
}

export function NewExpenseForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, description, amount: Number(amount), date }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo registrar el gasto.");
      return;
    }
    setDescription("");
    setAmount("");
    router.refresh();
  }

  if (categories.length === 0) return <p style={{ color: "var(--ink-soft)" }}>No hay categorías cargadas.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Categoría</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Descripción</label>
        <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Compra de carne" />
      </div>
      <div className="field">
        <label>Monto</label>
        <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha</label>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Registrar gasto"}
      </button>
    </form>
  );
}

export function PayExpenseButton({ expenseId, accounts }: { expenseId: string; accounts: Account[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    if (accounts.length === 0) return;
    setLoading(true);
    const res = await fetch(`/api/expenses/${expenseId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accounts[0].id, date: new Date().toISOString().slice(0, 10) }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button className="btn btn-secondary" onClick={handlePay} disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
      {loading ? "…" : `Pagar desde ${accounts[0]?.name ?? "cuenta"}`}
    </button>
  );
}

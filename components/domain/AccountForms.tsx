"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";

type Account = { id: string; name: string; type: string };

/** Lista de cuentas con edición de nombre y desactivar inline -- reemplaza el bloque estático que había en accounts/page.tsx. No hay borrado real: cash_movements referencia account_id por FK. */
export function AccountsList({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function startEdit(a: Account) {
    setEditingId(a.id);
    setName(a.name);
    setError(null);
  }

  async function saveEdit(id: string) {
    const result = await apiAction(`/api/accounts/${id}`, "PATCH", { name });
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar esta cuenta? Deja de aparecer para nuevos movimientos, pero el historial no se toca.")) return;
    const result = await apiAction(`/api/accounts/${id}`, "PATCH", { active: false });
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    router.refresh();
  }

  if (accounts.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Todavía no hay cuentas cargadas.</p>;

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {accounts.map((a) =>
        editingId === a.id ? (
          <div key={a.id} className="row" style={{ gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn" type="button" onClick={() => saveEdit(a.id)}>
              Guardar
            </button>
            <button className="btn-secondary" type="button" onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div key={a.id} className="row" style={{ alignItems: "center" }}>
            <span>{a.name}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="pill">{a.type}</span>
              <button className="btn-secondary" type="button" onClick={() => startEdit(a)}>
                Editar
              </button>
              <button className="btn-secondary" type="button" onClick={() => deactivate(a.id)}>
                Desactivar
              </button>
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function NewAccountForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear la cuenta.");
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="acc-name">Nombre de la cuenta</label>
        <input id="acc-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Caja chica" />
      </div>
      <div className="field">
        <label htmlFor="acc-type">Tipo</label>
        <select id="acc-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="efectivo">Efectivo</option>
          <option value="banco">Banco</option>
          <option value="mercado_pago">Mercado Pago</option>
          <option value="otra_billetera">Otra billetera</option>
        </select>
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Crear cuenta"}
      </button>
    </form>
  );
}

export function OpeningBalanceForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/accounts/${accountId}/opening-balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), date, direction: "ingreso" }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.toString() ?? "No se pudo cargar el saldo inicial (¿ya tenía uno?).");
      return;
    }
    setAmount("");
    router.refresh();
  }

  if (accounts.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>Creá una cuenta primero para poder cargar su saldo inicial.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label htmlFor="ob-account">Cuenta</label>
        <select id="ob-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ob-amount">Saldo actual real</label>
        <input id="ob-amount" type="number" required min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="ob-date">Fecha</label>
        <input id="ob-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Cargar saldo inicial"}
      </button>
    </form>
  );
}

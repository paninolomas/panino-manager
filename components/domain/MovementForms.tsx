"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";
import { toNumber } from "../../lib/client/number";

type Account = { id: string; name: string };
type Movement = { id: string; accountId: string; amount: number; direction: "ingreso" | "egreso"; originType: string };

/** Lista de últimos movimientos con botón "Revertir" -- reverse_movement() (0011/0014) ya existía, solo le faltaba UI. Recibe las cuentas crudas (serializable) en vez de una función -- pasar funciones como prop de Server Component a Client Component no anda en Next.js (rompe con "Minified React error #441"), el lookup y el formateo de moneda se resuelven acá adentro. */
export function MovementsList({ movements, accounts }: { movements: Movement[]; accounts: Account[] }) {
  const router = useRouter();
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;
  function formatARS(n: number) {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  }

  async function reverse(id: string) {
    if (!confirm("¿Revertir este movimiento? Se crea un movimiento inverso, no se borra el original.")) return;
    setReversingId(id);
    const result = await apiAction(`/api/movements/${id}/reverse`, "POST", {});
    setReversingId(null);
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  if (movements.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Sin movimientos todavía.</p>;

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {movements.slice(0, 30).map((m) => (
        <div key={m.id} className="row" style={{ alignItems: "center" }}>
          <span>
            {accountName(m.accountId)} · <span style={{ color: "var(--ink-soft)" }}>{m.originType}</span>
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="figure" style={{ color: m.direction === "egreso" ? "var(--risk)" : "var(--positive)" }}>
              {m.direction === "egreso" ? "-" : "+"}
              {formatARS(m.amount)}
            </span>
            {m.originType !== "reversal" && (
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: 13 }}
                type="button"
                disabled={reversingId === m.id}
                onClick={() => reverse(m.id)}
              >
                {reversingId === m.id ? "…" : "Revertir"}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ManualMovementForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"ingreso" | "egreso">("egreso");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "manual",
        accountId,
        amount: toNumber(amount),
        direction,
        date,
        description,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo registrar el movimiento.");
      return;
    }
    setAmount("");
    setDescription("");
    router.refresh();
  }

  if (accounts.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Creá una cuenta primero.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Cuenta</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Tipo</label>
        <select value={direction} onChange={(e) => setDirection(e.target.value as "ingreso" | "egreso")}>
          <option value="egreso">Egreso</option>
          <option value="ingreso">Ingreso</option>
        </select>
      </div>
      <div className="field">
        <label>Monto</label>
        <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha</label>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Descripción (obligatoria)</label>
        <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: ajuste por diferencia de caja" />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Registrar movimiento"}
      </button>
    </form>
  );
}

export function TransferForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [fromAccount, setFromAccount] = useState(accounts[0]?.id ?? "");
  const [toAccount, setToAccount] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "transfer", fromAccount, toAccount, amount: toNumber(amount), date, description }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo transferir (¿elegiste la misma cuenta de origen y destino?).");
      return;
    }
    setAmount("");
    setDescription("");
    router.refresh();
  }

  if (accounts.length < 2) return <p style={{ color: "var(--ink-soft)" }}>Necesitás al menos 2 cuentas para transferir.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Desde</label>
        <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Hacia</label>
        <select value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Monto</label>
        <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha</label>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Descripción</label>
        <input required value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Transfiriendo…" : "Transferir"}
      </button>
    </form>
  );
}

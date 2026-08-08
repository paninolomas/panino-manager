"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Account = { id: string; name: string };

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
        amount: Number(amount),
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
      body: JSON.stringify({ kind: "transfer", fromAccount, toAccount, amount: Number(amount), date, description }),
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

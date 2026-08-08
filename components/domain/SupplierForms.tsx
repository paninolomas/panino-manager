"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Supplier = { id: string; name: string; default_payment_terms_days: number };
type Account = { id: string; name: string };

export function NewSupplierForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [terms, setTerms] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, defaultPaymentTermsDays: Number(terms) }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear el proveedor.");
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Nombre</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Frigorífico X" />
      </div>
      <div className="field">
        <label>Días de crédito habituales</label>
        <input type="number" min="0" value={terms} onChange={(e) => setTerms(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Agregar proveedor"}
      </button>
    </form>
  );
}

export function NewObligationForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/suppliers/obligations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, amount: Number(amount), purchaseDate, estimatedDueDate: dueDate }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo registrar la obligación.");
      return;
    }
    setAmount("");
    router.refresh();
  }

  if (suppliers.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Agregá un proveedor primero.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Proveedor</label>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Monto</label>
        <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha de compra</label>
        <input type="date" required value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Vencimiento estimado</label>
        <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Registrar obligación"}
      </button>
    </form>
  );
}

export function PayObligationButton({ obligationId, accounts }: { obligationId: string; accounts: Account[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    if (accounts.length === 0) return;
    setLoading(true);
    const res = await fetch(`/api/suppliers/obligations/${obligationId}/pay`, {
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

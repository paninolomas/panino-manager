"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";

type Supplier = { id: string; name: string; default_payment_terms_days: number };
type Account = { id: string; name: string };
type Obligation = { id: string; supplierId: string; amount: number; estimatedDueDate: string; status: string };

/** Lista de proveedores con editar/desactivar. Sin borrado real -- obligations referencia supplier_id por FK. */
export function SuppliersList({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [terms, setTerms] = useState("0");
  const [error, setError] = useState<string | null>(null);

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setName(s.name);
    setTerms(String(s.default_payment_terms_days));
    setError(null);
  }

  async function saveEdit(id: string) {
    const result = await apiAction(`/api/suppliers/${id}`, "PATCH", { name, defaultPaymentTermsDays: Number(terms) });
    if (!result.ok) return setError(result.error ?? null);
    setEditingId(null);
    router.refresh();
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este proveedor? Las obligaciones ya cargadas no se tocan.")) return;
    const result = await apiAction(`/api/suppliers/${id}`, "PATCH", { active: false });
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  if (suppliers.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Todavía no hay proveedores cargados.</p>;

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {suppliers.map((s) =>
        editingId === s.id ? (
          <div key={s.id} className="row" style={{ gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <input
              type="number"
              min="0"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              style={{ width: 80 }}
            />
            <button className="btn" type="button" onClick={() => saveEdit(s.id)}>
              Guardar
            </button>
            <button className="btn-secondary" type="button" onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div key={s.id} className="row">
            <span>{s.name}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="pill">{s.default_payment_terms_days} días</span>
              <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => startEdit(s)}>
                Editar
              </button>
              <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => deactivate(s.id)}>
                Desactivar
              </button>
            </span>
          </div>
        )
      )}
    </div>
  );
}

/** Fila de obligación pendiente con editar (monto/vencimiento) + el botón de pagar que ya existía. Solo aplica a pendientes -- una vez pagada, el trigger guard_obligation_immutability (0005) rechaza el cambio y el form ni se muestra. */
export function ObligationRow({
  obligation,
  supplierName,
  accounts,
}: {
  obligation: Obligation;
  supplierName: string;
  accounts: Account[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(obligation.amount));
  const [dueDate, setDueDate] = useState(obligation.estimatedDueDate);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const result = await apiAction(`/api/suppliers/obligations/${obligation.id}`, "PATCH", {
      amount: Number(amount),
      estimatedDueDate: dueDate,
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
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 120 }} />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
        {supplierName} · <span style={{ color: "var(--ink-soft)" }}>vence {obligation.estimatedDueDate}</span>
      </span>
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span className="figure">{formatARS(obligation.amount)}</span>
        <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => setEditing(true)}>
          Editar
        </button>
        {accounts.length > 0 && <PayObligationButton obligationId={obligation.id} accounts={accounts} />}
      </span>
    </div>
  );
}

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

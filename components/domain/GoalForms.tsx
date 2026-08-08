"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";

/** Editar (monto objetivo / período) o eliminar un objetivo. A diferencia del resto de los módulos, goals no tiene ninguna tabla que lo referencie -- se permite borrar de verdad (policy "goals delete", 0032), no solo desactivar. */
export function GoalActions({ goalId, targetValue, periodStart, periodEnd }: { goalId: string; targetValue: number; periodStart: string; periodEnd: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(targetValue));
  const [start, setStart] = useState(periodStart);
  const [end, setEnd] = useState(periodEnd);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const result = await apiAction(`/api/goals/${goalId}`, "PATCH", {
      targetValue: Number(value),
      periodStart: start,
      periodEnd: end,
    });
    if (!result.ok) return setError(result.error ?? null);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("¿Eliminar este objetivo? No se puede deshacer.")) return;
    const result = await apiAction(`/api/goals/${goalId}`, "DELETE");
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="stack">
        {error && <div className="error-banner">{error}</div>}
        <div className="row" style={{ gap: 8 }}>
          <input type="number" min="0.01" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 140 }} />
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
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
    <div className="row" style={{ gap: 8 }}>
      {error && <span style={{ color: "var(--risk)", fontSize: 12 }}>{error}</span>}
      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => setEditing(true)}>
        Editar
      </button>
      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={remove}>
        Eliminar
      </button>
    </div>
  );
}

const VARIABLES = [
  { value: "facturacion", label: "Facturación" },
  { value: "ganancia", label: "Ganancia" },
  { value: "pedidos", label: "Pedidos" },
  { value: "ticket_promedio", label: "Ticket promedio" },
  { value: "margen", label: "Margen" },
  { value: "caja", label: "Caja" },
  { value: "ahorro", label: "Ahorro" },
];

export function NewGoalForm() {
  const router = useRouter();
  const [type, setType] = useState<"weekly" | "monthly" | "annual">("weekly");
  const [variable, setVariable] = useState("facturacion");
  const [targetValue, setTargetValue] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, variable, targetValue: Number(targetValue), periodStart, periodEnd }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear el objetivo.");
      return;
    }
    setTargetValue("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Tipo</label>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="weekly">Semanal</option>
          <option value="monthly">Mensual</option>
          <option value="annual">Anual</option>
        </select>
      </div>
      <div className="field">
        <label>Variable</label>
        <select value={variable} onChange={(e) => setVariable(e.target.value)}>
          {VARIABLES.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Valor objetivo</label>
        <input type="number" required min="0.01" step="0.01" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
      </div>
      <div className="field">
        <label>Desde</label>
        <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
      </div>
      <div className="field">
        <label>Hasta</label>
        <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Crear objetivo"}
      </button>
    </form>
  );
}

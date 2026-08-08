"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

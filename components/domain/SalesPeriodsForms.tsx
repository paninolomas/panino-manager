"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toNumber } from "../../lib/client/number";
import { downloadCsv } from "../../lib/client/csv";

type Period = {
  id: string;
  label: string | null;
  periodStart: string;
  periodEnd: string;
  totalUnits: number;
  totalRevenue: number;
  totalNetProfit: number;
  itemCount: number;
};

type ProfitabilityRow = { productId: string; productName: string; channelId: string; channelName: string };

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

/** Crea un período nuevo (label opcional + rango de fechas). */
function NewPeriodForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sales-periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || null, periodStart, periodEnd }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear el período.");
      return;
    }
    setLabel("");
    setPeriodStart("");
    setPeriodEnd("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Nombre (opcional)</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej: Primera quincena agosto" />
      </div>
      <div className="field">
        <label>Desde</label>
        <input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
      </div>
      <div className="field">
        <label>Hasta</label>
        <input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Crear período"}
      </button>
    </form>
  );
}

/** Grilla para cargar cantidad vendida de cada producto x canal en un período -- reutiliza las mismas filas de la calculadora de arriba. */
function PeriodQuantitiesGrid({ periodId, rows, initialQuantities }: { periodId: string; rows: ProfitabilityRow[]; initialQuantities: Record<string, number> }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [`${r.productId}-${r.channelId}`, initialQuantities[`${r.productId}-${r.channelId}`] ? String(initialQuantities[`${r.productId}-${r.channelId}`]) : ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const lines = rows.map((r) => ({
      productId: r.productId,
      channelId: r.channelId,
      quantity: toNumber(quantities[`${r.productId}-${r.channelId}`]) || 0,
    }));
    const res = await fetch(`/api/sales-periods/${periodId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("No se pudieron guardar las cantidades.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="stack" style={{ paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
      {error && <div className="error-banner">{error}</div>}
      {saved && <p style={{ fontSize: 12, color: "var(--positive)" }}>Cantidades guardadas.</p>}
      {rows.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          No hay productos con precio cargado todavía -- cargá precios por canal más arriba para que aparezcan acá.
        </p>
      )}
      {rows.map((r) => {
        const key = `${r.productId}-${r.channelId}`;
        return (
          <div key={key} className="row" style={{ alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13 }}>
              {r.productName} <span style={{ color: "var(--ink-soft)" }}>· {r.channelName}</span>
            </span>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={quantities[key] ?? ""}
              onChange={(e) => setQuantities((q) => ({ ...q, [key]: e.target.value }))}
              style={{ width: 90 }}
            />
          </div>
        );
      })}
      {rows.length > 0 && (
        <button className="btn" type="button" disabled={saving} onClick={handleSave} style={{ alignSelf: "flex-start" }}>
          {saving ? "Guardando…" : "Guardar cantidades"}
        </button>
      )}
    </div>
  );
}

/** Una fila de la lista de períodos -- expandible para cargar cantidades, con borrar y exportar. */
function PeriodRow({ period, profitabilityRows }: { period: Period; profitabilityRows: ProfitabilityRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialQuantities, setInitialQuantities] = useState<Record<string, number> | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (initialQuantities === null) {
      setLoading(true);
      const res = await fetch(`/api/sales-periods/${period.id}`);
      setLoading(false);
      if (res.ok) {
        const items: { productId: string; channelId: string; quantity: number }[] = await res.json();
        setInitialQuantities(Object.fromEntries(items.map((i) => [`${i.productId}-${i.channelId}`, i.quantity])));
      }
    }
  }

  async function handleExport() {
    const res = await fetch(`/api/sales-periods/${period.id}`);
    if (!res.ok) return;
    const items: { productName: string; channelName: string; quantity: number; unitPrice: number; unitCost: number; unitNetProfit: number }[] = await res.json();
    downloadCsv(
      `ventas_${period.periodStart}_${period.periodEnd}.csv`,
      ["Producto", "Canal", "Cantidad", "Precio unitario", "Costo unitario", "Ganancia real unitaria", "Facturación", "Ganancia real total"],
      items.map((i) => [i.productName, i.channelName, i.quantity, i.unitPrice, i.unitCost, i.unitNetProfit, i.quantity * i.unitPrice, i.quantity * i.unitNetProfit])
    );
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar el período "${period.label ?? `${period.periodStart} – ${period.periodEnd}`}"? No se puede deshacer.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/sales-periods/${period.id}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="stack" style={{ paddingBottom: 4 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <span>
          <strong>{period.label ?? "(sin nombre)"}</strong> · {period.periodStart} – {period.periodEnd}
          {period.itemCount > 0 && (
            <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>
              {" "}
              · {period.totalUnits} un. · {formatARS(period.totalRevenue)} facturado · {formatARS(period.totalNetProfit)} ganancia real
            </span>
          )}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" type="button" style={{ padding: "4px 10px", fontSize: 13 }} onClick={toggle}>
            {open ? "Cerrar" : "Cargar cantidades"}
          </button>
          {period.itemCount > 0 && (
            <button className="btn btn-secondary" type="button" style={{ padding: "4px 10px", fontSize: 13 }} onClick={handleExport}>
              Exportar
            </button>
          )}
          <button className="btn btn-secondary" type="button" style={{ padding: "4px 10px", fontSize: 13, color: "var(--risk)" }} disabled={deleting} onClick={handleDelete}>
            {deleting ? "…" : "Eliminar"}
          </button>
        </span>
      </div>
      {open && (loading || initialQuantities === null ? (
        <p style={{ color: "var(--ink-soft)", paddingLeft: 12 }}>Cargando…</p>
      ) : (
        <PeriodQuantitiesGrid periodId={period.id} rows={profitabilityRows} initialQuantities={initialQuantities} />
      ))}
    </div>
  );
}

export function SalesPeriodsSection({ periods, profitabilityRows }: { periods: Period[]; profitabilityRows: ProfitabilityRow[] }) {
  return (
    <div className="stack">
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Cargá a mano cuántas unidades vendiste de cada producto en un rango de fechas, para sacar
        conclusiones reales de venta. El precio/costo/ganancia de cada línea queda congelado al
        momento de guardar -- si después cambiás precios, los períodos ya cargados no se mueven.
      </p>
      <NewPeriodForm />
      {periods.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Todavía no cargaste ningún período.</p>}
      {periods.map((p) => (
        <PeriodRow key={p.id} period={p} profitabilityRows={profitabilityRows} />
      ))}
    </div>
  );
}

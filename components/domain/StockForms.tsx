"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";
import { toNumber } from "../../lib/client/number";
import { HistoryPanel } from "./ProfitabilityForms";

type StockItem = { id: string; name: string; unit: string; min_stock?: number; safety_stock?: number };
type StockMovement = { id: string; stockItemId: string; quantity: number; direction: "entrada" | "salida"; date: string; originType: string };

/**
 * Carga/actualiza el costo vigente de un insumo (stock_item_costs,
 * versionado vía set_stock_item_cost 0039). Al guardar, recipes.repo.ts
 * recalcula en cascada products.current_cost de todos los productos que
 * usan este insumo en su receta -- confirmado con el usuario: solo hace
 * falta tocar el costo del insumo, no reabrir cada receta.
 *
 * Dos modos de carga, elegibles cada vez (decisión del usuario):
 *   - "Directo": ya sabés el costo por kg/unidad, lo escribís tal cual.
 *   - "Por compra": tenés el total pagado + cuánto compraste (ej. "pagué
 *     $9.000 por 3kg de lomo") y la app hace la división antes de guardar.
 */
export function StockItemCostForm({ item, currentCost }: { item: StockItem; currentCost: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"directo" | "compra">("directo");
  const [unitCost, setUnitCost] = useState(currentCost !== null ? String(currentCost) : "");
  const [totalPaid, setTotalPaid] = useState("");
  const [purchasedQty, setPurchasedQty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ productId: string; productName: string; cost: number }[] | null>(null);

  const computedUnitCost =
    mode === "compra" && toNumber(totalPaid) > 0 && toNumber(purchasedQty) > 0 ? toNumber(totalPaid) / toNumber(purchasedQty) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalUnitCost = mode === "directo" ? toNumber(unitCost) : computedUnitCost;
    if (finalUnitCost === null || Number.isNaN(finalUnitCost) || finalUnitCost < 0) {
      setError("Completá un costo válido.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch(`/api/stock-items/${item.id}/cost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitCost: finalUnitCost }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.toString() ?? "No se pudo actualizar el costo.");
      return;
    }
    setResult(body.updatedProducts as { productId: string; productName: string; cost: number }[]);
    setUnitCost(String(finalUnitCost));
    setTotalPaid("");
    setPurchasedQty("");
    router.refresh();
  }

  if (!open) {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => setOpen(true)}>
          {currentCost === null ? "Cargar costo" : `$${currentCost.toLocaleString("es-AR")}/${item.unit}`}
        </button>
        <HistoryPanel
          label={`Historial de costo -- ${item.name}`}
          fetchUrl={`/api/stock-items/${item.id}/cost/history`}
          formatValue={(n) => `$${n.toLocaleString("es-AR")}/${item.unit}`}
        />
      </span>
    );
  }

  return (
    <div className="stack" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 10, minWidth: 260 }}>
      {error && <span style={{ color: "var(--risk)", fontSize: 12 }}>{error}</span>}
      <div className="row" style={{ fontSize: 12, gap: 12 }}>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="radio" checked={mode === "directo"} onChange={() => setMode("directo")} />
          Directo (por {item.unit})
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="radio" checked={mode === "compra"} onChange={() => setMode("compra")} />
          Por compra (total + cantidad)
        </label>
      </div>

      <form onSubmit={handleSubmit} className="stack" style={{ gap: 6 }}>
        {mode === "directo" ? (
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            Costo por {item.unit}
            <input type="number" required min="0" step="0.0001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={{ width: 110 }} />
          </label>
        ) : (
          <>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              Total pagado
              <input type="number" required min="0" step="0.01" value={totalPaid} onChange={(e) => setTotalPaid(e.target.value)} style={{ width: 110 }} />
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
              Cantidad comprada ({item.unit})
              <input type="number" required min="0.0001" step="0.0001" value={purchasedQty} onChange={(e) => setPurchasedQty(e.target.value)} style={{ width: 110 }} />
            </label>
            {computedUnitCost !== null && (
              <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                = ${computedUnitCost.toLocaleString("es-AR", { maximumFractionDigits: 4 })} por {item.unit}
              </p>
            )}
          </>
        )}
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn" type="submit" disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
            {loading ? "…" : "Guardar costo"}
          </button>
          <button className="btn-secondary" type="button" onClick={() => setOpen(false)} style={{ padding: "4px 10px", fontSize: 13 }}>
            Cerrar
          </button>
        </span>
      </form>

      {result && (
        <p style={{ fontSize: 12, color: "var(--positive)" }}>
          {result.length === 0
            ? "Costo guardado. Ningún producto usa este insumo en su receta todavía."
            : `Costo guardado. Se recalcularon ${result.length} producto${result.length === 1 ? "" : "s"}: ${result
                .map((r) => `${r.productName} ($${r.cost.toLocaleString("es-AR")})`)
                .join(", ")}.`}
        </p>
      )}
    </div>
  );
}

/** Botón inline para editar nombre/unidad/stock mínimo/de seguridad de un insumo, y desactivarlo. Sin borrado real -- product_recipe_items/stock_movements referencian stock_item_id por FK. */
export function StockItemEditToggle({ item }: { item: StockItem }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [unit, setUnit] = useState(item.unit);
  const [minStock, setMinStock] = useState(String(item.min_stock ?? 0));
  const [safetyStock, setSafetyStock] = useState(String(item.safety_stock ?? 0));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const result = await apiAction(`/api/stock-items/${item.id}`, "PATCH", {
      name,
      unit,
      minStock: toNumber(minStock),
      safetyStock: toNumber(safetyStock),
    });
    if (!result.ok) return setError(result.error ?? null);
    setEditing(false);
    router.refresh();
  }

  async function deactivate() {
    if (!confirm("¿Desactivar este insumo? Deja de aparecer para nuevos movimientos, el historial no se toca.")) return;
    const result = await apiAction(`/api/stock-items/${item.id}`, "PATCH", { active: false });
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="stack" style={{ alignItems: "flex-end" }}>
        {error && <span style={{ color: "var(--risk)", fontSize: 12 }}>{error}</span>}
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 140 }} />
          <input value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 70 }} />
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>Stock mínimo</label>
          <input type="number" min="0" step="0.01" value={minStock} onChange={(e) => setMinStock(e.target.value)} style={{ width: 80 }} />
          <label style={{ fontSize: 12, color: "var(--ink-soft)" }}>Stock de seguridad</label>
          <input type="number" min="0" step="0.01" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} style={{ width: 80 }} />
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button className="btn" type="button" onClick={save} style={{ padding: "4px 10px", fontSize: 13 }}>
            Guardar
          </button>
          <button className="btn-secondary" type="button" onClick={() => setEditing(false)} style={{ padding: "4px 10px", fontSize: 13 }}>
            Cancelar
          </button>
        </span>
      </div>
    );
  }

  return (
    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => setEditing(true)}>
        Editar
      </button>
      <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={deactivate}>
        Desactivar
      </button>
    </span>
  );
}

/** Lista de últimos movimientos de stock con botón "Revertir" -- reverse_stock_movement() (0026) ya existía, solo le faltaba UI. Recibe los insumos crudos (serializable) en vez de funciones -- pasar funciones como prop de Server Component a Client Component no anda en Next.js (rompe con "Minified React error #441"), el lookup se resuelve acá adentro. */
export function StockMovementsList({ movements, items }: { movements: StockMovement[]; items: StockItem[] }) {
  const router = useRouter();
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? "—";
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.unit ?? "";

  async function reverse(id: string) {
    if (!confirm("¿Revertir este movimiento? Se crea un movimiento inverso, no se borra el original.")) return;
    setReversingId(id);
    const result = await apiAction(`/api/stock-movements/${id}/reverse`, "POST", {});
    setReversingId(null);
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  if (movements.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Sin movimientos todavía.</p>;

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {movements.slice(0, 20).map((m) => (
        <div key={m.id} className="row" style={{ alignItems: "center" }}>
          <span>
            {itemName(m.stockItemId)} · <span style={{ color: "var(--ink-soft)" }}>{m.originType}</span>
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="figure" style={{ color: m.direction === "salida" ? "var(--risk)" : "var(--positive)" }}>
              {m.direction === "salida" ? "-" : "+"}
              {m.quantity} {itemUnit(m.stockItemId)}
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

export function NewStockItemForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [minStock, setMinStock] = useState("0");
  const [safetyStock, setSafetyStock] = useState("0");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/stock-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        unit,
        minStock: toNumber(minStock),
        safetyStock: toNumber(safetyStock),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear el insumo.");
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
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Carne" />
      </div>
      <div className="field">
        <label>Unidad</label>
        <input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, unidad, litro…" />
      </div>
      <div className="field">
        <label>Stock mínimo</label>
        <input type="number" min="0" step="0.01" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
      </div>
      <div className="field">
        <label>Stock de seguridad</label>
        <input type="number" min="0" step="0.01" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Agregar insumo"}
      </button>
    </form>
  );
}

export function StockMovementForm({ items }: { items: StockItem[] }) {
  const router = useRouter();
  const [stockItemId, setStockItemId] = useState(items[0]?.id ?? "");
  const [direction, setDirection] = useState<"entrada" | "salida">("entrada");
  const [originType, setOriginType] = useState<"purchase" | "consumption_manual" | "waste" | "adjustment">("purchase");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originOptions: Record<string, { value: string; label: string }[]> = {
    entrada: [{ value: "purchase", label: "Compra" }, { value: "adjustment", label: "Ajuste por conteo" }],
    salida: [
      { value: "consumption_manual", label: "Consumo (venta/uso)" },
      { value: "waste", label: "Merma" },
      { value: "adjustment", label: "Ajuste por conteo" },
    ],
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/stock-movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockItemId,
        quantity: toNumber(quantity),
        direction,
        date,
        originType,
        description: description || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo registrar el movimiento.");
      return;
    }
    setQuantity("");
    router.refresh();
  }

  if (items.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Cargá un insumo primero.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Insumo</label>
        <select value={stockItemId} onChange={(e) => setStockItemId(e.target.value)}>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Tipo</label>
        <select
          value={direction}
          onChange={(e) => {
            const d = e.target.value as "entrada" | "salida";
            setDirection(d);
            setOriginType(d === "entrada" ? "purchase" : "consumption_manual");
          }}
        >
          <option value="entrada">Entrada</option>
          <option value="salida">Salida</option>
        </select>
      </div>
      <div className="field">
        <label>Origen</label>
        <select value={originType} onChange={(e) => setOriginType(e.target.value as typeof originType)}>
          {originOptions[direction].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Cantidad</label>
        <input type="number" required min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha</label>
        <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Nota (opcional)</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Registrar movimiento"}
      </button>
    </form>
  );
}

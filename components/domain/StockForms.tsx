"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StockItem = { id: string; name: string; unit: string };

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
        minStock: Number(minStock),
        safetyStock: Number(safetyStock),
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
        quantity: Number(quantity),
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecipeEditor } from "./SalesForms";

type Product = { id: string; name: string };
type Channel = { id: string; name: string };
type StockItem = { id: string; name: string; unit: string };
type RecipeLine = { stockItemId: string; stockItemName: string; unit: string; quantity: number; unitCost: number };

/**
 * Costo manual (EditProductCostForm, ya existía) + botón "Receta" que abre
 * el mismo RecipeEditor de /sales (Fase 11) -- antes esta pantalla solo
 * tenía el campo de costo plano, sin acceso al desglose por insumo.
 */
export function ProductCostRow({ product, currentCost, stockItems }: { product: Product; currentCost: number; stockItems: StockItem[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeLine[] | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (recipe === null) {
      setLoading(true);
      const res = await fetch(`/api/sales/products/${product.id}/recipe`);
      setLoading(false);
      if (res.ok) setRecipe(await res.json());
    }
  }

  return (
    <div className="stack" style={{ paddingBottom: 4 }}>
      <div className="row" style={{ alignItems: "center" }}>
        <span>{product.name}</span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <EditProductCostForm product={product} currentCost={currentCost} />
          <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={toggle}>
            Receta
          </button>
        </span>
      </div>
      {open && (loading ? <p style={{ color: "var(--ink-soft)", paddingLeft: 12 }}>Cargando…</p> : <RecipeEditor productId={product.id} stockItems={stockItems} initialRecipe={recipe ?? []} />)}
    </div>
  );
}

export function EditProductCostForm({ product, currentCost }: { product: Product; currentCost: number }) {
  const router = useRouter();
  const [cost, setCost] = useState(String(currentCost));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales/products/${product.id}/cost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentCost: Number(cost) }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo actualizar el costo.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {error && <span className="error-banner" style={{ fontSize: 12 }}>{error}</span>}
      <input
        type="number"
        min="0"
        step="0.01"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        style={{ width: 100, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6 }}
      />
      <button className="btn btn-secondary" type="submit" disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
        {loading ? "…" : "Guardar"}
      </button>
    </form>
  );
}

export function SetChannelPriceForm({ products, channels }: { products: Product[]; channels: Channel[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/channel-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, channelId, price: Number(price) }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo fijar el precio.");
      return;
    }
    setPrice("");
    router.refresh();
  }

  if (products.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Cargá un producto primero.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Producto</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Canal</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Precio</label>
        <input type="number" required min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Fijar precio"}
      </button>
    </form>
  );
}

export function GenerateProfitabilityForm() {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/profitability/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.toString() ?? "No se pudo calcular la rentabilidad del período.");
      return;
    }
    setResult(body);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Desde</label>
        <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
      </div>
      <div className="field">
        <label>Hasta</label>
        <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Calculando…" : "Recalcular rentabilidad del período"}
      </button>
      {result && (
        <p style={{ fontSize: 13, color: "var(--positive)" }}>
          Se generaron {result.count} snapshots de margen (producto × canal).
        </p>
      )}
    </form>
  );
}

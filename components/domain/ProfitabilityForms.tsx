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

/** Editar la regalía de marca (una sola tasa global, aplica a Panino/Nino/Goat por igual, confirmado por el usuario). Versionada -- set_royalty_rate (0036) cierra la vigente e inserta una nueva, no pisa el historial. */
export function RoyaltyRateForm({ current }: { current: number }) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(current * 100));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/royalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: Number(percent) / 100 }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo actualizar la regalía.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="row" style={{ gap: 8, alignItems: "center" }}>
      {error && <span style={{ color: "var(--risk)", fontSize: 12 }}>{error}</span>}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        Regalía de marca (%)
        <input type="number" required min="0" max="100" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ width: 80 }} />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
        {loading ? "…" : "Guardar"}
      </button>
    </form>
  );
}

/** Editar la comisión vigente de un canal -- antes solo se podía cargar por SQL directo (channel_cost_items nunca tuvo setter en la app). */
export function ChannelCommissionForm({ channel }: { channel: Channel & { commissionPercent: number } }) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(channel.commissionPercent * 100));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/channel-commission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id, percent: Number(percent) / 100 }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo actualizar la comisión.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="row" style={{ gap: 8, alignItems: "center" }}>
      {error && <span style={{ color: "var(--risk)", fontSize: 12 }}>{error}</span>}
      <span style={{ flex: 1 }}>{channel.name}</span>
      <input type="number" required min="0" max="100" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ width: 80 }} />
      <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>%</span>
      <button className="btn btn-secondary" type="submit" disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
        {loading ? "…" : "Guardar"}
      </button>
    </form>
  );
}

/**
 * Tabla "Rentabilidad por producto": calculadora en vivo (precio vigente,
 * costo actual, comisión del canal, regalía de marca) -- NO depende de
 * ventas cargadas, a diferencia del resto del módulo. Cálculo en
 * calculateProductProfitability (profitability-engine.ts), esto solo arma
 * las filas.
 */
export function ProductProfitabilityTable({
  rows,
  royaltyPercent,
}: {
  rows: { productId: string; productName: string; channelId: string; channelName: string; price: number; cost: number; commissionPercent: number }[];
  royaltyPercent: number;
}) {
  function formatARS(n: number) {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  }

  if (rows.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>No hay precios por canal cargados todavía -- cargalos en Ventas para que aparezcan acá.</p>;
  }

  return (
    <div className="stack" style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12 }}>
            <th style={{ padding: "4px 8px" }}>Producto</th>
            <th style={{ padding: "4px 8px" }}>Canal</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Precio</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Costo</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Comisión</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Regalía</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Total obtenido</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Rentabilidad</th>
            <th style={{ padding: "4px 8px", textAlign: "right" }}>Margen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const commissionAmount = r.price * r.commissionPercent;
            const royaltyAmount = r.price * royaltyPercent;
            const netObtained = r.price - commissionAmount - royaltyAmount;
            const profitability = r.cost > 0 ? netObtained / r.cost : null;
            const margin = netObtained > 0 ? (netObtained - r.cost) / netObtained : null;
            return (
              <tr key={`${r.productId}-${r.channelId}`} style={{ borderTop: "1px dashed var(--line)" }}>
                <td style={{ padding: "4px 8px" }}>{r.productName}</td>
                <td style={{ padding: "4px 8px", color: "var(--ink-soft)" }}>{r.channelName}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(r.price)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: r.cost === 0 ? "var(--risk)" : undefined }}>
                  {r.cost === 0 ? "sin costo" : formatARS(r.cost)}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(commissionAmount)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(royaltyAmount)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(netObtained)}</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>
                  {profitability === null ? "—" : `${(profitability * 100).toFixed(1)}%`}
                </td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>
                  {margin === null ? "—" : `${(margin * 100).toFixed(1)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

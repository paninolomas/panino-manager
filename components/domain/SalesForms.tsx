"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";

type Channel = { id: string; name: string };
type Product = { id: string; name: string };

/**
 * Lista de productos con editar nombre/costo/desactivar + precio por canal.
 * El precio queda versionado (valid_from/valid_to) por el RPC set_channel_price
 * (0024) -- ya existía desde Fase 2, solo le faltaba un form que lo llamara.
 * Sin borrado real -- channel_prices/order_items referencian product_id por FK.
 */
export function ProductsList({ products, channels }: { products: { id: string; name: string; current_cost: number }[]; channels: Channel[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [priceFormId, setPriceFormId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  function startEdit(p: { id: string; name: string; current_cost: number }) {
    setEditingId(p.id);
    setName(p.name);
    setCost(String(p.current_cost));
    setError(null);
  }

  async function saveEdit(id: string) {
    const [nameResult, costResult] = await Promise.all([
      apiAction(`/api/sales/products/${id}`, "PATCH", { name }),
      apiAction(`/api/sales/products/${id}/cost`, "POST", { currentCost: Number(cost) || 0 }),
    ]);
    if (!nameResult.ok) return setError(nameResult.error ?? null);
    if (!costResult.ok) return setError(costResult.error ?? null);
    setEditingId(null);
    router.refresh();
  }

  async function deactivate(id: string) {
    if (!confirm("¿Desactivar este producto? Deja de aparecer para nuevas ventas, el historial no se toca.")) return;
    const result = await apiAction(`/api/sales/products/${id}`, "PATCH", { active: false });
    if (!result.ok) return setError(result.error ?? null);
    router.refresh();
  }

  async function savePrice(productId: string) {
    const result = await apiAction("/api/channel-prices", "POST", { productId, channelId, price: Number(price) });
    if (!result.ok) return setError(result.error ?? null);
    setPriceFormId(null);
    setPrice("");
    router.refresh();
  }

  if (products.length === 0) return <p style={{ color: "var(--ink-soft)" }}>No hay productos cargados.</p>;

  return (
    <div className="stack">
      {error && <div className="error-banner">{error}</div>}
      {products.map((p) => (
        <div key={p.id} className="stack" style={{ paddingBottom: 4 }}>
          {editingId === p.id ? (
            <div className="row" style={{ gap: 8 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
              <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} style={{ width: 120 }} />
              <button className="btn" type="button" onClick={() => saveEdit(p.id)}>
                Guardar
              </button>
              <button className="btn-secondary" type="button" onClick={() => setEditingId(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="row">
              <span>{p.name}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="figure" style={{ color: "var(--ink-soft)" }}>
                  costo ${p.current_cost}
                </span>
                <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => startEdit(p)}>
                  Editar
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: "4px 10px", fontSize: 13 }}
                  type="button"
                  onClick={() => setPriceFormId(priceFormId === p.id ? null : p.id)}
                >
                  Precio por canal
                </button>
                <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => deactivate(p.id)}>
                  Desactivar
                </button>
              </span>
            </div>
          )}
          {priceFormId === p.id && (
            <div className="row" style={{ gap: 8, paddingLeft: 12 }}>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input type="number" min="0" step="0.01" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 120 }} />
              <button className="btn" type="button" onClick={() => savePrice(p.id)}>
                Guardar precio
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function NewSaleForm({ channels, products }: { channels: Channel[]; products: Product[] }) {
  const router = useRouter();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [externalOrderNumber, setExternalOrderNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        externalOrderNumber: externalOrderNumber || undefined,
        items: [{ productId, quantity: Number(quantity), unitPrice: Number(unitPrice) }],
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo registrar la venta.");
      return;
    }
    setUnitPrice("");
    setExternalOrderNumber("");
    router.refresh();
  }

  if (products.length === 0) return <p style={{ color: "var(--ink-soft)" }}>Cargá al menos un producto primero.</p>;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
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
        <label>Cantidad</label>
        <input type="number" required min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      <div className="field">
        <label>Precio unitario</label>
        <input type="number" required min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
      </div>
      <div className="field">
        <label>N° de pedido (opcional)</label>
        <input value={externalOrderNumber} onChange={(e) => setExternalOrderNumber(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Registrar venta"}
      </button>
    </form>
  );
}

export function NewProductForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sales/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, currentCost: Number(cost) || 0 }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo crear el producto.");
      return;
    }
    setName("");
    setCost("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Nombre</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Lomito Grande" />
      </div>
      <div className="field">
        <label>Costo actual</label>
        <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Agregar producto"}
      </button>
    </form>
  );
}

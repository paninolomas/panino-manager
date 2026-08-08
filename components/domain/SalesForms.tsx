"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Channel = { id: string; name: string };
type Product = { id: string; name: string };

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

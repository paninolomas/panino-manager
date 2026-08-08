"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";

type Channel = { id: string; name: string };
type Product = { id: string; name: string };
type StockItem = { id: string; name: string; unit: string };
type RecipeLine = { stockItemId: string; stockItemName: string; unit: string; quantity: number; unitCost: number };

/**
 * Plantilla de insumos por default: en vez de agregar de a uno, se listan
 * TODOS los insumos del catálogo con un campo de cantidad. El usuario
 * completa los que aplican al producto y deja el resto en blanco -- un
 * único "Guardar receta" reemplaza toda la receta de una vez (PUT, no
 * incremental) y el costo se recalcula y persiste en current_cost del lado
 * del servidor (recipe-engine.ts), esta UI solo arma el request.
 */
export function RecipeEditor({ productId, stockItems, initialRecipe }: { productId: string; stockItems: StockItem[]; initialRecipe: RecipeLine[] }) {
  const router = useRouter();
  const initialQuantities: Record<string, string> = {};
  for (const item of stockItems) {
    const existing = initialRecipe.find((r) => r.stockItemId === item.id);
    initialQuantities[item.id] = existing ? String(existing.quantity) : "";
  }
  const [quantities, setQuantities] = useState<Record<string, string>>(initialQuantities);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCost, setSavedCost] = useState<number | null>(null);

  const previewTotal = stockItems.reduce((sum, item) => {
    const qty = Number(quantities[item.id]);
    const line = initialRecipe.find((r) => r.stockItemId === item.id);
    const unitCost = line?.unitCost ?? 0;
    return sum + (qty > 0 ? qty * unitCost : 0);
  }, 0);

  async function save() {
    setSaving(true);
    setError(null);
    const lines = stockItems.map((item) => ({ stockItemId: item.id, quantity: Number(quantities[item.id]) || 0 }));
    const res = await fetch(`/api/sales/products/${productId}/recipe`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    setSaving(false);
    if (!res.ok) {
      const parsed = await res.json().catch(() => null);
      setError(parsed?.error?.toString() ?? "No se pudo guardar la receta.");
      return;
    }
    const data = await res.json();
    setSavedCost(data.cost);
    router.refresh();
  }

  return (
    <div className="stack" style={{ paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
      {error && <div className="error-banner">{error}</div>}
      {stockItems.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay insumos cargados todavía -- creá algunos en Stock primero.</p>}
      {stockItems.map((item) => {
        const line = initialRecipe.find((r) => r.stockItemId === item.id);
        return (
          <div key={item.id} className="row" style={{ alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>
              {item.name} <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>({item.unit})</span>
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0"
              value={quantities[item.id]}
              onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
              style={{ width: 100 }}
            />
            {line && (
              <span style={{ fontSize: 12, color: "var(--ink-soft)", width: 90, textAlign: "right" }}>
                ${(line.quantity * line.unitCost).toFixed(2)}
              </span>
            )}
          </div>
        );
      })}
      <div className="row" style={{ alignItems: "center", paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
        <span className="label">Costo total (con lo tipeado ahora mismo)</span>
        <span className="figure">${previewTotal.toFixed(2)}</span>
      </div>
      <button className="btn" type="button" disabled={saving} onClick={save}>
        {saving ? "Guardando…" : "Guardar receta"}
      </button>
      {savedCost !== null && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>Guardado. Costo del producto actualizado a ${savedCost.toFixed(2)}.</p>}
    </div>
  );
}

/**
 * Lista de productos con editar nombre/costo/desactivar + precio por canal.
 * El precio queda versionado (valid_from/valid_to) por el RPC set_channel_price
 * (0024) -- ya existía desde Fase 2, solo le faltaba un form que lo llamara.
 * Sin borrado real -- channel_prices/order_items referencian product_id por FK.
 */
export function ProductsList({ products, channels, stockItems }: { products: { id: string; name: string; current_cost: number }[]; channels: Channel[]; stockItems: StockItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [priceFormId, setPriceFormId] = useState<string | null>(null);
  const [recipeFormId, setRecipeFormId] = useState<string | null>(null);
  const [recipesByProduct, setRecipesByProduct] = useState<Record<string, RecipeLine[]>>({});
  const [recipeLoading, setRecipeLoading] = useState<string | null>(null);
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

  async function toggleRecipe(productId: string) {
    if (recipeFormId === productId) {
      setRecipeFormId(null);
      return;
    }
    setRecipeFormId(productId);
    if (!recipesByProduct[productId]) {
      setRecipeLoading(productId);
      const res = await fetch(`/api/sales/products/${productId}/recipe`);
      setRecipeLoading(null);
      if (res.ok) {
        const data: RecipeLine[] = await res.json();
        setRecipesByProduct((prev) => ({ ...prev, [productId]: data }));
      } else {
        setError("No se pudo cargar la receta.");
      }
    }
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
                <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => toggleRecipe(p.id)}>
                  Receta
                </button>
                <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: 13 }} type="button" onClick={() => deactivate(p.id)}>
                  Desactivar
                </button>
              </span>
            </div>
          )}
          {recipeFormId === p.id &&
            (recipeLoading === p.id ? (
              <p style={{ color: "var(--ink-soft)", paddingLeft: 12 }}>Cargando…</p>
            ) : (
              <RecipeEditor productId={p.id} stockItems={stockItems} initialRecipe={recipesByProduct[p.id] ?? []} />
            ))}
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

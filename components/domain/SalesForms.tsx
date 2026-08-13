"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiAction } from "../../lib/client/api-action";
import { toNumber } from "../../lib/client/number";

type Channel = { id: string; name: string };
type Product = { id: string; name: string };
type StockItem = { id: string; name: string; unit: string; unitCost?: number };
type RecipeLine = { stockItemId: string; stockItemName: string; unit: string; quantity: number; unitCost: number };

/**
 * Plantilla de insumos por default: en vez de agregar de a uno, se listan
 * TODOS los insumos del catálogo con un campo de cantidad. El usuario
 * completa los que aplican al producto y deja el resto en blanco -- un
 * único "Guardar receta" reemplaza toda la receta de una vez (PUT, no
 * incremental) y el costo se recalcula y persiste en current_cost del lado
 * del servidor (recipe-engine.ts), esta UI solo arma el request.
 */
export function RecipeEditor({
  productId,
  stockItems,
  initialRecipe,
  onSaved,
  otherProducts,
}: {
  productId: string;
  stockItems: StockItem[];
  initialRecipe: RecipeLine[];
  /** Se llama después de un guardado exitoso -- el que lo pasa (ProductCostRow, ProductsList) debe usarlo para RE-PEDIR la receta guardada al servidor, no solo para avisar. Sin esto, la próxima vez que se abre "Receta" (cerrás y volvés a abrir, o cambiás de pantalla y volvés) se sigue mostrando el `initialRecipe` viejo que quedó en el estado del padre desde el primer fetch -- que si la primera vez que abriste la receta estaba vacía, se queda vacía para siempre aunque ya hayas guardado después. */
  onSaved?: () => void | Promise<void>;
  /** Catálogo de productos para copiar su receta como punto de partida (combos: "Combo X" = Milanesa + Papas, sin re-tipear cada insumo). Opcional -- si no se pasa, no se muestra el selector. Excluye al propio productId en el caller. */
  otherProducts?: Product[];
}) {
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
  const [copyFromId, setCopyFromId] = useState(otherProducts?.[0]?.id ?? "");
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  /**
   * Copia (suma) los insumos de otro producto ya cargado al borrador actual
   * -- para armar un combo ("Combo X" = Milanesa + Papas) sin re-tipear
   * cada insumo. Es una copia puntual, no un vínculo: una vez que tocás
   * "Guardar receta" queda 100% independiente -- si después cambiás la
   * receta de la Milanesa sola, el combo NO se entera (decisión confirmada
   * con el usuario).
   */
  async function copyFrom() {
    if (!copyFromId) return;
    setCopyLoading(true);
    setCopyMessage(null);
    const res = await fetch(`/api/sales/products/${copyFromId}/recipe`);
    setCopyLoading(false);
    if (!res.ok) {
      setCopyMessage("No se pudo leer la receta de ese producto.");
      return;
    }
    const lines: RecipeLine[] = await res.json();
    if (lines.length === 0) {
      setCopyMessage("Ese producto no tiene receta cargada todavía.");
      return;
    }
    setQuantities((prev) => {
      const next = { ...prev };
      for (const line of lines) {
        const existing = toNumber(next[line.stockItemId]) || 0;
        next[line.stockItemId] = String(existing + line.quantity);
      }
      return next;
    });
    const productName = otherProducts?.find((p) => p.id === copyFromId)?.name ?? "producto";
    setCopyMessage(`Se sumaron ${lines.length} insumo${lines.length === 1 ? "" : "s"} de "${productName}". Revisá las cantidades antes de guardar.`);
  }

  const previewTotal = stockItems.reduce((sum, item) => {
    const qty = toNumber(quantities[item.id]);
    // Antes usaba line?.unitCost (de initialRecipe, la receta YA guardada) --
    // en una receta nueva ningún insumo tiene línea todavía, así que el
    // costo en vivo daba siempre $0 aunque el insumo ya tuviera costo
    // cargado en Stock. El costo del insumo viene directo de stockItems
    // (listStockItemCosts, fusionado del lado del servidor), no de la
    // receta guardada -- así funciona el preview incluso antes del primer
    // "Guardar receta".
    const unitCost = item.unitCost ?? 0;
    return sum + (qty > 0 ? qty * unitCost : 0);
  }, 0);

  async function save() {
    setSaving(true);
    setError(null);
    const lines = stockItems.map((item) => ({ stockItemId: item.id, quantity: toNumber(quantities[item.id]) || 0 }));
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
    await onSaved?.();
    router.refresh();
  }

  return (
    <div className="stack" style={{ paddingLeft: 12, borderLeft: "2px solid var(--line)" }}>
      {error && <div className="error-banner">{error}</div>}
      {otherProducts && otherProducts.length > 0 && (
        <div className="row" style={{ gap: 8, alignItems: "center", fontSize: 13, paddingBottom: 4, borderBottom: "1px dashed var(--line)" }}>
          <span style={{ color: "var(--ink-soft)" }}>Copiar ingredientes de</span>
          <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} style={{ flex: 1 }}>
            {otherProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" type="button" disabled={copyLoading} onClick={copyFrom} style={{ padding: "4px 10px", fontSize: 13 }}>
            {copyLoading ? "…" : "Agregar"}
          </button>
        </div>
      )}
      {copyMessage && <p style={{ fontSize: 12, color: "var(--ink-soft)" }}>{copyMessage}</p>}
      {stockItems.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay insumos cargados todavía -- creá algunos en Stock primero.</p>}
      {stockItems.map((item) => {
        const qty = toNumber(quantities[item.id]);
        const unitCost = item.unitCost ?? 0;
        const lineTotal = qty > 0 ? qty * unitCost : 0;
        return (
          <div key={item.id} className="row" style={{ alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>
              {item.name} <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>({item.unit})</span>
              {unitCost === 0 && <span style={{ color: "var(--risk)", fontSize: 11 }}> · sin costo cargado</span>}
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
            <span style={{ fontSize: 12, color: "var(--ink-soft)", width: 90, textAlign: "right" }}>
              {qty > 0 ? `$${lineTotal.toFixed(2)}` : ""}
            </span>
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
      apiAction(`/api/sales/products/${id}/cost`, "POST", { currentCost: toNumber(cost) || 0 }),
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
    const result = await apiAction("/api/channel-prices", "POST", { productId, channelId, price: toNumber(price) });
    if (!result.ok) return setError(result.error ?? null);
    setPriceFormId(null);
    setPrice("");
    router.refresh();
  }

  async function loadRecipe(productId: string) {
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

  async function toggleRecipe(productId: string) {
    if (recipeFormId === productId) {
      setRecipeFormId(null);
      return;
    }
    setRecipeFormId(productId);
    if (!recipesByProduct[productId]) {
      await loadRecipe(productId);
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
              <RecipeEditor
                productId={p.id}
                stockItems={stockItems}
                initialRecipe={recipesByProduct[p.id] ?? []}
                onSaved={() => loadRecipe(p.id)}
                otherProducts={products.filter((other) => other.id !== p.id)}
              />
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cierre rápido diario (Fase 20): carga agregada de pedidos + monto bruto
 * del día, sin discriminar producto ni canal. Pensado para los días que no
 * hay tiempo de cargar el detalle en "Registrar venta" -- solo alimenta el
 * objetivo semanal (pedidos/facturación/ticket promedio), no genera
 * movimiento de caja ni afecta Rentabilidad. Si el mismo día se carga
 * también el detalle en "Registrar venta", el detalle tiene prioridad y
 * este cierre queda ignorado para ese día (ver daily_sales_series).
 */
export function DailyClosingForm() {
  const router = useRouter();
  const [saleDate, setSaleDate] = useState(todayIso());
  const [orderCount, setOrderCount] = useState("");
  const [revenue, setRevenue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const orderCountNum = toNumber(orderCount) || 0;
  const revenueNum = toNumber(revenue) || 0;
  const avgTicket = orderCountNum > 0 ? revenueNum / orderCountNum : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    const res = await fetch("/api/sales/daily-closing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saleDate, orderCount: orderCountNum, revenue: revenueNum }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo guardar el cierre del día.");
      return;
    }
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      {success && <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>Cierre guardado.</p>}
      <div className="field">
        <label>Fecha</label>
        <input required type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Pedidos</label>
        <input required type="number" min="0" step="1" value={orderCount} onChange={(e) => setOrderCount(e.target.value)} />
      </div>
      <div className="field">
        <label>Monto del día (bruto)</label>
        <input required type="number" min="0" step="0.01" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
      </div>
      {orderCountNum > 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Ticket promedio: {avgTicket.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}
        </p>
      )}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Guardar cierre del día"}
      </button>
    </form>
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
        items: [{ productId, quantity: toNumber(quantity), unitPrice: toNumber(unitPrice) }],
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
      body: JSON.stringify({ name, currentCost: toNumber(cost) || 0 }),
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

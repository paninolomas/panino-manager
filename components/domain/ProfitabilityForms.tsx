"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RecipeEditor } from "./SalesForms";
import { toNumber } from "../../lib/client/number";
import { downloadCsv } from "../../lib/client/csv";

type Product = { id: string; name: string };
type Channel = { id: string; name: string };
type StockItem = { id: string; name: string; unit: string; unitCost?: number };
type RecipeLine = { stockItemId: string; stockItemName: string; unit: string; quantity: number; unitCost: number };

/**
 * Costo manual (EditProductCostForm, ya existía) + botón "Receta" que abre
 * el mismo RecipeEditor de /sales (Fase 11) -- antes esta pantalla solo
 * tenía el campo de costo plano, sin acceso al desglose por insumo.
 */
/**
 * Crear un producto Y su precio de canal en un solo paso, pensado para
 * Rentabilidad -- la tabla de arriba (product_profitability_inputs) hace
 * INNER JOIN contra channel_prices, así que un producto SIN precio en
 * ningún canal no aparece ahí (sí aparece en "Costo actual por producto",
 * que lista todo lo activo sin ese requisito -- de ahí la confusión de
 * "lo creé y no me impactó arriba"). Con precio en 0 (o el canal vacío)
 * simplemente no llama a /api/channel-prices y el producto queda creado
 * pero sigue sin aparecer arriba hasta que se le cargue un precio a mano
 * más abajo, en "Precios por canal".
 */
export function NewProductWithPriceForm({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [price, setPrice] = useState("");
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
    if (!res.ok) {
      setLoading(false);
      setError("No se pudo crear el producto.");
      return;
    }
    const product = await res.json();

    const priceValue = toNumber(price);
    if (channelId && priceValue > 0) {
      const priceRes = await fetch("/api/channel-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, channelId, price: priceValue }),
      });
      if (!priceRes.ok) {
        setLoading(false);
        setError('El producto se creó, pero no se pudo cargar el precio -- cargalo a mano en "Precios por canal" más abajo.');
        return;
      }
    }

    setLoading(false);
    setName("");
    setCost("");
    setPrice("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Nombre</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Combo rápido" />
      </div>
      <div className="field">
        <label>Costo inicial (opcional -- lo puede reemplazar la Receta después)</label>
        <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Canal</label>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Precio en ese canal</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Sin esto no aparece arriba en la tabla" />
        </div>
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Creando…" : "Agregar producto"}
      </button>
    </form>
  );
}

/**
 * Exporta TODAS las recetas de TODOS los productos activos en un solo CSV
 * (una fila por producto x insumo) -- informe separado del de Rentabilidad,
 * a pedido del usuario ("nada mezclado"). Pide /api/reports/recipes recién
 * al tocar el botón, no en la carga de la página (son N+1 queries).
 */
export function ExportRecipesButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/reports/recipes");
    setLoading(false);
    if (!res.ok) {
      setError("No se pudieron exportar las recetas.");
      return;
    }
    const rows: { productName: string; stockItemName: string; unit: string; quantity: number; unitCost: number; lineCost: number }[] = await res.json();
    if (rows.length === 0) {
      setError("No hay recetas cargadas todavía.");
      return;
    }
    downloadCsv(
      `recetas_${new Date().toISOString().slice(0, 10)}.csv`,
      ["Producto", "Insumo", "Unidad", "Cantidad", "Costo unitario", "Costo de la línea"],
      rows.map((r) => [r.productName, r.stockItemName, r.unit, r.quantity, r.unitCost, r.lineCost])
    );
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button className="btn btn-secondary" type="button" disabled={loading} onClick={handleClick}>
        {loading ? "Exportando…" : "Exportar recetas (CSV)"}
      </button>
      {error && <span style={{ fontSize: 11, color: "var(--risk)" }}>{error}</span>}
    </span>
  );
}

/**
 * Panel de historial genérico -- sirve tanto para precio y descuento
 * (product_channel_discounts/channel_prices) como para costo de insumo
 * (stock_item_costs): las tres tablas ya guardan cada versión con
 * valid_from/valid_to, esto solo las pide y las muestra. No hay nada que
 * guardar acá, es de solo lectura.
 */
export function HistoryPanel({
  label,
  fetchUrl,
  formatValue,
}: {
  label: string;
  fetchUrl: string;
  formatValue: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<{ value: number; validFrom: string; validTo: string | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (entries === null) {
      setLoading(true);
      const res = await fetch(fetchUrl);
      setLoading(false);
      if (!res.ok) {
        setError("No se pudo cargar el historial.");
        return;
      }
      setEntries(await res.json());
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button className="btn btn-secondary" type="button" style={{ padding: "2px 6px", fontSize: 11 }} onClick={toggle}>
        {open ? "Cerrar historial" : "Historial"}
      </button>
      {open && (
        <div style={{ fontSize: 11, border: "1px dashed var(--line)", borderRadius: 6, padding: 6, minWidth: 180 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{label}</div>
          {loading && <span style={{ color: "var(--ink-soft)" }}>Cargando…</span>}
          {error && <span style={{ color: "var(--risk)" }}>{error}</span>}
          {entries && entries.length === 0 && <span style={{ color: "var(--ink-soft)" }}>Sin cambios registrados todavía.</span>}
          {entries &&
            entries.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ color: "var(--ink-soft)" }}>
                  {e.validFrom}
                  {e.validTo ? ` – ${e.validTo}` : " – hoy"}
                </span>
                <span style={{ fontWeight: e.validTo ? 400 : 600 }}>{formatValue(e.value)}</span>
              </div>
            ))}
        </div>
      )}
    </span>
  );
}

export function ProductCostRow({ product, currentCost, stockItems, allProducts }: { product: Product; currentCost: number; stockItems: StockItem[]; allProducts: Product[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeLine[] | null>(null);

  async function loadRecipe() {
    setLoading(true);
    const res = await fetch(`/api/sales/products/${product.id}/recipe`);
    setLoading(false);
    if (res.ok) setRecipe(await res.json());
  }

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (recipe === null) {
      await loadRecipe();
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
      {open &&
        (loading ? (
          <p style={{ color: "var(--ink-soft)", paddingLeft: 12 }}>Cargando…</p>
        ) : (
          <RecipeEditor
            productId={product.id}
            stockItems={stockItems}
            initialRecipe={recipe ?? []}
            onSaved={loadRecipe}
            otherProducts={allProducts.filter((p) => p.id !== product.id)}
          />
        ))}
    </div>
  );
}

/** Editar la regalía de marca (una sola tasa global, aplica a Panino/Nino/Goat por igual, confirmado por el usuario). Versionada -- set_royalty_rate (0036) cierra la vigente e inserta una nueva, no pisa el historial. */
export function RoyaltyRateForm({ current }: { current: number }) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(current * 100));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo motivo que en EditProductCostForm: useState(current) solo corre
  // al montar, sin esto el recuadro queda desincronizado si el dato
  // cambia por otra vía y el componente no se remonta.
  useEffect(() => {
    setPercent(String(current * 100));
  }, [current]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/royalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: toNumber(percent) / 100 }),
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

  useEffect(() => {
    setPercent(String(channel.commissionPercent * 100));
  }, [channel.commissionPercent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/channel-commission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id, percent: toNumber(percent) / 100 }),
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
      <span style={{ flex: 1 }}>{channel.name} · comisión</span>
      <input type="number" required min="0" max="100" step="0.01" value={percent} onChange={(e) => setPercent(e.target.value)} style={{ width: 80 }} />
      <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>%</span>
      <button className="btn btn-secondary" type="submit" disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
        {loading ? "…" : "Guardar"}
      </button>
    </form>
  );
}

/** Editar "Servicio pago en línea" vigente de un canal (Fase 16) -- mismo patrón que ChannelCommissionForm, cargo distinto de la comisión. */
export function ChannelOnlinePaymentFeeForm({ channel }: { channel: Channel & { onlinePaymentFeePercent: number } }) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(channel.onlinePaymentFeePercent * 100));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPercent(String(channel.onlinePaymentFeePercent * 100));
  }, [channel.onlinePaymentFeePercent]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/channel-online-payment-fee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id, percent: toNumber(percent) / 100 }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo actualizar el cargo.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="row" style={{ gap: 8, alignItems: "center" }}>
      {error && <span style={{ color: "var(--risk)", fontSize: 12 }}>{error}</span>}
      <span style={{ flex: 1 }}>{channel.name} · servicio pago en línea</span>
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
 *
 * Umbrales de referencia del semáforo de Margen -- alineados a benchmarks
 * de food cost de gastronomía argentina 2026 (28-35% en restaurante con
 * salón, 22-28% en delivery/fast casual, >40% señal de alarma), pero
 * TRADUCIDOS a la métrica de esta tabla: acá "Margen" se calcula sobre el
 * Total obtenido NETO (ya descontada la comisión del canal + regalía +
 * pago en línea), no sobre el precio de venta bruto como el food cost
 * tradicional. Con la estructura real de PedidosYa (~21% entre comisión,
 * regalía y pago en línea), un food cost de 40% (alarma) equivale a ~49%
 * de este Margen, y el techo ideal de delivery (28% food cost) equivale a
 * ~64,5% -- de ahí salen los defaults de abajo (50/65), no son un número
 * general de "gastronomía" sin ajustar. Igual quedan editables acá mismo
 * (estado local, no persistido) porque la traducción exacta depende de la
 * comisión de CADA canal -- en un canal con menos comisión (ej. mostrador
 * sin delivery), el mismo food cost da un Margen más alto, así que estos
 * umbrales leen más "generoso" para pedidos sin intermediario.
 */
const DEFAULT_MARGIN_THRESHOLDS = { red: 50, yellow: 65, warning: 90 };

type SortKey =
  | "productName"
  | "channelName"
  | "price"
  | "cost"
  | "foodCostPercent"
  | "commissionAmount"
  | "royaltyAmount"
  | "onlinePaymentFeeAmount"
  | "discountAmount"
  | "netObtained"
  | "netProfit"
  | "profitability"
  | "margin";

type EnrichedRow = {
  productId: string;
  productName: string;
  channelId: string;
  channelName: string;
  price: number;
  cost: number;
  discountPercent: number;
  foodCostPercent: number | null;
  commissionAmount: number;
  royaltyAmount: number;
  onlinePaymentFeeAmount: number;
  discountAmount: number;
  netObtained: number;
  /** Ganancia real en pesos = netObtained (lo cobrado neto del canal) menos el costo del insumo. A diferencia de netObtained, ESTE número sí resta el costo -- Rentabilidad/Margen son la misma resta expresada en %. */
  netProfit: number;
  profitability: number | null;
  margin: number | null;
};

/**
 * Ordena por la columna elegida. Los valores null (Rentabilidad/Margen sin
 * costo cargado, "—" en la tabla) quedan SIEMPRE al final sin importar la
 * dirección -- si no, "de mayor a menor" pondría los "—" primero (null
 * como si fuera "menor que cualquier número" en JS), que es justo al
 * revés de lo útil: lo que no tiene dato no debería taparle el podio a lo
 * que sí lo tiene.
 */
function sortRows(rows: EnrichedRow[], key: SortKey, dir: "asc" | "desc"): EnrichedRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * factor;
    return ((av as number) - (bv as number)) * factor;
  });
}

function marginColor(marginPercent: number | null, thresholds: { red: number; yellow: number; warning: number }) {
  if (marginPercent === null) return undefined;
  const pct = marginPercent * 100;
  if (pct < thresholds.red) return "var(--risk)";
  if (pct < thresholds.yellow) return "var(--warning)";
  if (pct > thresholds.warning) return "var(--warning)"; // margen sospechosamente alto -- probable costo/receta sin cargar
  return "var(--positive)";
}

/**
 * Traduce un % de Margen (sobre Total obtenido neto) a su food cost
 * equivalente (sobre precio bruto) -- para mostrar en la leyenda el
 * benchmark que la gente del rubro conoce ("food cost"), no solo el
 * número interno de la tabla. Usa como referencia el descuento típico de
 * PedidosYa (~21,11% entre comisión 14,35% + regalía 4% + pago en línea
 * 2,76%) porque es el canal real de este negocio -- en un canal con menos
 * comisión (mostrador, sin intermediario) el mismo Margen corresponde a
 * un food cost más alto de lo que dice acá, por eso es una referencia,
 * no un valor exacto por fila.
 */
const TYPICAL_CHANNEL_DEDUCTION = 0.2111;
function marginToFoodCostEquivalent(marginPercent: number) {
  return (1 - marginPercent / 100) * (1 - TYPICAL_CHANNEL_DEDUCTION) * 100;
}

/**
 * Color directo para la columna "Food cost" -- mismos cortes investigados
 * (Argentina 2026): <=30% saludable/ideal, 30-40% aceptable pero para
 * vigilar, >40% alarma (la operación deja de ser rentable salvo ticket
 * promedio muy alto). A diferencia de marginColor, este no depende de los
 * umbrales editables del semáforo de Margen -- son dos lecturas distintas
 * del mismo costo (una sobre precio bruto, otra sobre neto post-comisión).
 */
function foodCostColor(foodCostPercent: number | null) {
  if (foodCostPercent === null) return undefined;
  const pct = foodCostPercent * 100;
  if (pct > 40) return "var(--risk)";
  if (pct > 30) return "var(--warning)";
  return "var(--positive)";
}

/**
 * Celda editable inline, usada tanto para Precio como para Descuento en la
 * tabla de Rentabilidad. Guarda al perder foco (blur) o con Enter, no en
 * cada tecla -- evita mandar un request por cada dígito tipeado. Muestra
 * un estado breve de "guardando…" / "✓" / error debajo del input.
 */
function InlineEditableCell({
  value,
  onSave,
  width = 90,
  formatDisplay,
}: {
  value: number;
  onSave: (newValue: number) => Promise<{ ok: boolean; error?: string }>;
  width?: number;
  formatDisplay: (n: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function commit() {
    const parsed = toNumber(draft);
    setEditing(false);
    if (Number.isNaN(parsed) || parsed < 0 || parsed === value) {
      setDraft(String(value));
      return;
    }
    setStatus("saving");
    setError(null);
    const result = await onSave(parsed);
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "No se pudo guardar.");
      setDraft(String(value));
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  if (!editing) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span
          onClick={() => {
            setDraft(String(value));
            setEditing(true);
          }}
          style={{ cursor: "pointer", borderBottom: "1px dashed var(--line)" }}
          title="Click para editar"
        >
          {formatDisplay(value)}
        </span>
        {status === "saving" && <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>guardando…</span>}
        {status === "saved" && <span style={{ fontSize: 10, color: "var(--positive)" }}>✓ guardado</span>}
        {status === "error" && <span style={{ fontSize: 10, color: "var(--risk)" }}>{error}</span>}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="number"
      min="0"
      step="any"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
        }
      }}
      style={{ width, textAlign: "right" }}
    />
  );
}

/**
 * Desactiva un producto directo desde la tabla de Rentabilidad -- útil acá
 * porque es donde más se nota un duplicado (mismo producto dos veces con
 * distinto precio/costo). Mismo patrón que ProductsList en Ventas
 * (PATCH active:false, no hay borrado real -- channel_prices,
 * product_recipe_items, order_items referencian el producto por FK). Si el
 * producto aparece en varios canales, aparece un botón por fila, pero
 * desactivar cualquiera desactiva el producto entero -- clickear otro
 * después es inofensivo (ya está desactivado).
 */
function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm(`¿Desactivar "${productName}"? Deja de aparecer en Ventas/Rentabilidad, pero el historial no se toca (no es un borrado real).`)) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.toString() ?? "No se pudo desactivar.");
      return;
    }
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <button
        className="btn btn-secondary"
        type="button"
        disabled={loading}
        onClick={handleDelete}
        style={{ padding: "3px 8px", fontSize: 12, color: "var(--risk)" }}
        title="Desactivar producto (por si está duplicado)"
      >
        {loading ? "…" : "Eliminar"}
      </button>
      {error && <span style={{ fontSize: 10, color: "var(--risk)" }}>{error}</span>}
    </span>
  );
}

export function ProductProfitabilityTable({
  rows,
  royaltyPercent,
}: {
  rows: {
    productId: string;
    productName: string;
    channelId: string;
    channelName: string;
    price: number;
    cost: number;
    commissionPercent: number;
    onlinePaymentFeePercent: number;
    discountPercent: number;
  }[];
  royaltyPercent: number;
}) {
  const router = useRouter();
  const [thresholds, setThresholds] = useState(DEFAULT_MARGIN_THRESHOLDS);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  function formatARS(n: number) {
    return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  }
  function formatPct(n: number) {
    return `${n.toFixed(1)}%`;
  }

  if (rows.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>No hay precios por canal cargados todavía -- cargalos en Ventas para que aparezcan acá.</p>;
  }

  async function savePrice(productId: string, channelId: string, newPrice: number) {
    const res = await fetch("/api/channel-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, channelId, price: newPrice }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error?.toString() ?? "No se pudo guardar el precio." };
    router.refresh();
    return { ok: true };
  }

  async function saveDiscount(productId: string, channelId: string, newPercentDisplay: number) {
    const res = await fetch("/api/product-channel-discount", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, channelId, percent: newPercentDisplay / 100 }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: body?.error?.toString() ?? "No se pudo guardar el descuento." };
    router.refresh();
    return { ok: true };
  }

  // Se calculan una sola vez acá (no adentro del .map de render) para poder
  // ordenar por columnas derivadas (Total obtenido, Rentabilidad, Margen)
  // sin repetir la cuenta.
  const enrichedRows: EnrichedRow[] = rows.map((r) => {
    const commissionAmount = r.price * r.commissionPercent;
    const royaltyAmount = r.price * royaltyPercent;
    const onlinePaymentFeeAmount = r.price * r.onlinePaymentFeePercent;
    const discountAmount = r.price * r.discountPercent;
    const netObtained = r.price - commissionAmount - royaltyAmount - onlinePaymentFeeAmount - discountAmount;
    const profitability = r.cost > 0 ? netObtained / r.cost : null;
    // Igual que profitability: sin costo cargado no hay margen real que
    // mostrar. Antes esto daba (netObtenido - 0) / netObtenido = 100%,
    // un artefacto de la fórmula que además se pintaba en amarillo como
    // si fuera una alerta real, mezclando "no hay dato" con "revisar
    // esto".
    const margin = r.cost > 0 && netObtained > 0 ? (netObtained - r.cost) / netObtained : null;
    // Food cost = costo / precio de venta BRUTO (no el neto post-comisión
    // como "Margen") -- es el número que se usa en el rubro para hablar de
    // "cómo está armada la receta", independiente de qué canal la vende.
    const foodCostPercent = r.price > 0 && r.cost > 0 ? r.cost / r.price : null;
    // Ganancia real en $ -- Total obtenido (lo cobrado neto del canal)
    // menos el costo del insumo. netObtained por sí solo NO resta esto,
    // por eso la gente confunde "Total obtenido" con "ganancia".
    const netProfit = netObtained - r.cost;
    return { ...r, commissionAmount, royaltyAmount, onlinePaymentFeeAmount, discountAmount, netObtained, netProfit, profitability, margin, foodCostPercent };
  });

  const sortedRows = sort ? sortRows(enrichedRows, sort.key, sort.dir) : enrichedRows;

  function exportCsv() {
    downloadCsv(
      `rentabilidad_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Producto",
        "Canal",
        "Precio",
        "Costo",
        "Food cost %",
        "Comisión",
        "Regalía",
        "Pago en línea",
        "Descuento %",
        "Total obtenido",
        "Ganancia real",
        "Rentabilidad %",
        "Margen %",
      ],
      sortedRows.map((r) => [
        r.productName,
        r.channelName,
        r.price,
        r.cost,
        r.foodCostPercent === null ? "" : (r.foodCostPercent * 100).toFixed(1),
        r.commissionAmount,
        r.royaltyAmount,
        r.onlinePaymentFeeAmount,
        (r.discountPercent * 100).toFixed(1),
        r.netObtained,
        r.cost === 0 ? "" : r.netProfit,
        r.profitability === null ? "" : (r.profitability * 100).toFixed(1),
        r.margin === null ? "" : (r.margin * 100).toFixed(1),
      ])
    );
  }

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: "desc" };
      if (current.dir === "desc") return { key, dir: "asc" };
      return null; // tercer click en la misma columna = sacar el orden
    });
  }

  function SortableHeader({ label, sortKey, align = "right" }: { label: string; sortKey: SortKey; align?: "left" | "right" }) {
    const active = sort?.key === sortKey;
    return (
      <th
        style={{ padding: "4px 8px", textAlign: align, cursor: "pointer", userSelect: "none", color: active ? "var(--ink)" : undefined }}
        onClick={() => toggleSort(sortKey)}
        title="Ordenar"
      >
        {label} {active ? (sort!.dir === "desc" ? "▼" : "▲") : ""}
      </th>
    );
  }

  return (
    <div className="stack full-bleed">
      <div className="full-bleed-inner stack">
      <div className="row" style={{ alignItems: "center", fontSize: 12, color: "var(--ink-soft)" }}>
        <span>
          🔴 Margen &lt; {thresholds.red}% (≈ food cost &gt;{marginToFoodCostEquivalent(thresholds.red).toFixed(0)}%, alarma) · 🟡{" "}
          {thresholds.red}–{thresholds.yellow}% (≈ food cost {marginToFoodCostEquivalent(thresholds.yellow).toFixed(0)}–
          {marginToFoodCostEquivalent(thresholds.red).toFixed(0)}%) o &gt; {thresholds.warning}% (revisar costo/receta) · 🟢 &gt;{thresholds.yellow}%
          (≈ food cost &lt;{marginToFoodCostEquivalent(thresholds.yellow).toFixed(0)}%, ideal delivery AR 2026)
          {" · "}equivalencia sobre PedidosYa, otros canales varían.
          {" · "}Precio y Descuento son editables -- click sobre el valor.
        </span>
        <button className="btn btn-secondary" type="button" style={{ padding: "2px 8px", fontSize: 12 }} onClick={exportCsv}>
          Exportar CSV
        </button>
        <button className="btn btn-secondary" type="button" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setEditingThresholds((v) => !v)}>
          {editingThresholds ? "Cerrar" : "Ajustar umbrales"}
        </button>
      </div>
      {editingThresholds && (
        <div className="row" style={{ gap: 12, alignItems: "center", fontSize: 12 }}>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Rojo por debajo de
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={thresholds.red}
              onChange={(e) => setThresholds((t) => ({ ...t, red: toNumber(e.target.value) }))}
              style={{ width: 56 }}
            />
            %
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Verde a partir de
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={thresholds.yellow}
              onChange={(e) => setThresholds((t) => ({ ...t, yellow: toNumber(e.target.value) }))}
              style={{ width: 56 }}
            />
            %
          </label>
          <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
            Alerta por arriba de
            <input
              type="number"
              min="0"
              max="200"
              step="1"
              value={thresholds.warning}
              onChange={(e) => setThresholds((t) => ({ ...t, warning: toNumber(e.target.value) }))}
              style={{ width: 56 }}
            />
            %
          </label>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--ink-soft)", fontSize: 12 }}>
            <SortableHeader label="Producto" sortKey="productName" align="left" />
            <SortableHeader label="Canal" sortKey="channelName" align="left" />
            <SortableHeader label="Precio" sortKey="price" />
            <SortableHeader label="Costo" sortKey="cost" />
            <SortableHeader label="Food cost" sortKey="foodCostPercent" />
            <SortableHeader label="Comisión" sortKey="commissionAmount" />
            <SortableHeader label="Regalía" sortKey="royaltyAmount" />
            <SortableHeader label="Pago en línea" sortKey="onlinePaymentFeeAmount" />
            <SortableHeader label="Descuento" sortKey="discountAmount" />
            <SortableHeader label="Total obtenido" sortKey="netObtained" />
            <SortableHeader label="Ganancia real" sortKey="netProfit" />
            <SortableHeader label="Rentabilidad" sortKey="profitability" />
            <SortableHeader label="Margen" sortKey="margin" />
            <th style={{ padding: "4px 8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            <tr key={`${r.productId}-${r.channelId}`} style={{ borderTop: "1px dashed var(--line)" }}>
              <td style={{ padding: "4px 8px" }}>{r.productName}</td>
              <td style={{ padding: "4px 8px", color: "var(--ink-soft)" }}>{r.channelName}</td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <InlineEditableCell
                    value={r.price}
                    formatDisplay={formatARS}
                    onSave={(newPrice) => savePrice(r.productId, r.channelId, newPrice)}
                  />
                  <HistoryPanel
                    label="Historial de precio"
                    fetchUrl={`/api/channel-prices/history?productId=${r.productId}&channelId=${r.channelId}`}
                    formatValue={formatARS}
                  />
                </span>
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right", color: r.cost === 0 ? "var(--risk)" : undefined }}>
                {r.cost === 0 ? "sin costo" : formatARS(r.cost)}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: foodCostColor(r.foodCostPercent) }}>
                {r.foodCostPercent === null ? "—" : `${(r.foodCostPercent * 100).toFixed(1)}%`}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(r.commissionAmount)}</td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(r.royaltyAmount)}</td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(r.onlinePaymentFeeAmount)}</td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                  <InlineEditableCell
                    value={r.discountPercent * 100}
                    width={60}
                    formatDisplay={formatPct}
                    onSave={(newPercentDisplay) => saveDiscount(r.productId, r.channelId, newPercentDisplay)}
                  />
                  <HistoryPanel
                    label="Historial de descuento"
                    fetchUrl={`/api/product-channel-discount/history?productId=${r.productId}&channelId=${r.channelId}`}
                    formatValue={(n) => formatPct(n * 100)}
                  />
                </span>
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>{formatARS(r.netObtained)}</td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: r.cost > 0 && r.netProfit < 0 ? "var(--risk)" : undefined }}>
                {r.cost === 0 ? "—" : formatARS(r.netProfit)}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600 }}>
                {r.profitability === null ? "—" : `${(r.profitability * 100).toFixed(1)}%`}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: marginColor(r.margin, thresholds) }}>
                {r.margin === null ? "—" : `${(r.margin * 100).toFixed(1)}%`}
              </td>
              <td style={{ padding: "4px 8px", textAlign: "right" }}>
                <DeleteProductButton productId={r.productId} productName={r.productName} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}

export function EditProductCostForm({ product, currentCost }: { product: Product; currentCost: number }) {
  const router = useRouter();
  const [cost, setCost] = useState(String(currentCost));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useState(currentCost) solo toma el valor de currentCost UNA VEZ, al
  // montar el componente -- si guardás la receta y products.current_cost
  // se recalcula del lado del servidor, router.refresh() manda un
  // currentCost nuevo como prop, pero como este input sigue siendo la
  // MISMA instancia de componente (mismo lugar en el árbol), React no
  // vuelve a correr el useState inicial y el recuadro se queda mostrando
  // el número viejo para siempre. Este efecto sincroniza el estado local
  // cada vez que cambia el costo real, así el recuadro refleja lo que
  // acabás de guardar en la receta sin tener que recargar la página.
  useEffect(() => {
    setCost(String(currentCost));
  }, [currentCost]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales/products/${product.id}/cost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentCost: toNumber(cost) }),
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
      body: JSON.stringify({ productId, channelId, price: toNumber(price) }),
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

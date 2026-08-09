import { listProducts, listChannels } from "../../../lib/repositories/sales.repo";
import { listStockItems, listStockItemCosts } from "../../../lib/repositories/stock.repo";
import { listLatestMarginSnapshots, getProductProfitabilityInputs, getActiveRoyaltyRate, getCommissionByChannel, getOnlinePaymentFeeByChannel } from "../../../lib/repositories/profitability.repo";
import { requireSocio } from "../../../lib/auth/session";
import { rankByMarginPercent, detectMarginDrops, calculateProductProfitability } from "../../../lib/services/profitability-engine";
import type { MarginSnapshot } from "../../../types/domain";
import {
  ProductCostRow,
  SetChannelPriceForm,
  GenerateProfitabilityForm,
  ProductProfitabilityTable,
  RoyaltyRateForm,
  ChannelCommissionForm,
  ChannelOnlinePaymentFeeForm,
} from "../../../components/domain/ProfitabilityForms";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const MARGIN_DROP_THRESHOLD = 0.02; // 2 puntos porcentuales, mismo umbral que la Sección 13 del prompt original de ejemplo

export default async function ProfitabilityPage() {
  await requireSocio();
  const [products, channels, rawSnapshots, stockItemsRaw, profitabilityRows, royaltyPercent, commissionByChannel, onlinePaymentFeeByChannel, itemCosts] = await Promise.all([
    listProducts(),
    listChannels(),
    listLatestMarginSnapshots(),
    listStockItems(),
    getProductProfitabilityInputs(),
    getActiveRoyaltyRate(),
    getCommissionByChannel(),
    getOnlinePaymentFeeByChannel(),
    listStockItemCosts(),
  ]);
  // Igual que en Ventas: el costo se fusiona acá para que el preview en
  // vivo de la receta (RecipeEditor) funcione desde el primer tipeo.
  const stockItems = stockItemsRaw.map((i) => ({ ...i, unitCost: itemCosts[i.id] ?? 0 }));

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "—";

  const snapshots: MarginSnapshot[] = (rawSnapshots ?? []).map((s) => ({
    productId: s.product_id,
    channelId: s.channel_id,
    unitsSold: Number(s.units_sold),
    unitPrice: Number(s.unit_price),
    unitCost: Number(s.unit_cost),
    unitProfit: Number(s.unit_profit),
    marginPercent: Number(s.margin_percent),
    totalProfit: Number(s.total_profit),
    totalContribution: Number(s.total_profit),
  }));

  // El snapshot más reciente por período (asumimos que el usuario recalcula
  // un período nuevo genuinamente distinto cada vez que corre "Recalcular").
  const periods = Array.from(new Set((rawSnapshots ?? []).map((s) => s.period_end))).sort().reverse();
  const latestPeriodEnd = periods[0];
  const previousPeriodEnd = periods[1];

  const current = snapshots.filter((s, i) => (rawSnapshots ?? [])[i]?.period_end === latestPeriodEnd);
  const previous = previousPeriodEnd
    ? snapshots.filter((s, i) => (rawSnapshots ?? [])[i]?.period_end === previousPeriodEnd)
    : [];

  const byMargin = rankByMarginPercent(current);
  const alerts = detectMarginDrops({ previous, current, thresholdPoints: MARGIN_DROP_THRESHOLD });

  // "Más ganancia total" y "Por canal" -- a pedido del usuario, dejan de ser
  // un acumulado de unidades vendidas en un período (margin_snapshots) y
  // pasan a resumir la calculadora de arriba (product_profitability_inputs):
  // no depende de haber vendido nada, es "si vendo UNA unidad de cada cosa,
  // cuál me deja más plata" en vez de "cuánto dejé acumulado hasta ahora".
  const calculatorResults = profitabilityRows.map((r) => ({
    ...r,
    ...calculateProductProfitability({
      price: r.price,
      cost: r.cost,
      commissionPercent: r.commissionPercent,
      royaltyPercent,
      onlinePaymentFeePercent: r.onlinePaymentFeePercent,
      discountPercent: r.discountPercent,
    }),
  }));

  const topByNetObtained = [...calculatorResults].sort((a, b) => b.netObtained - a.netObtained).slice(0, 5);

  const netObtainedByChannel: Record<string, { channelName: string; total: number; productCount: number }> = {};
  for (const r of calculatorResults) {
    const entry = (netObtainedByChannel[r.channelId] ??= { channelName: r.channelName, total: 0, productCount: 0 });
    entry.total += r.netObtained;
    entry.productCount += 1;
  }

  return (
    <div className="stack">
      <h1>Rentabilidad</h1>

      <section className="card stack">
        <div className="label">Rentabilidad por producto (calculadora, no depende de ventas)</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Precio vigente por canal, costo actual (de la receta si la tiene, o el manual) y las
          comisiones que aplican. Se recalcula solo con lo que ya tenés cargado — no hace falta
          haber vendido nada para verlo.
        </p>
        <ProductProfitabilityTable rows={profitabilityRows} royaltyPercent={royaltyPercent} />
        <hr className="ticket-rule" />
        <RoyaltyRateForm current={royaltyPercent} />
        {channels
          .filter((c) => c.name === "pedidosya" || c.name === "rappi" || c.name === "pedix")
          .map((c) => (
            <div key={c.id} className="stack" style={{ gap: 4 }}>
              <ChannelCommissionForm channel={{ ...c, commissionPercent: commissionByChannel[c.id] ?? 0 }} />
              <ChannelOnlinePaymentFeeForm channel={{ ...c, onlinePaymentFeePercent: onlinePaymentFeeByChannel[c.id] ?? 0 }} />
            </div>
          ))}
      </section>

      {alerts.length > 0 && (
        <section className="card stack">
          <div className="label" style={{ color: "var(--risk)" }}>
            ⚠ Caídas de margen detectadas
          </div>
          {alerts.map((a) => (
            <p key={`${a.productId}-${a.channelId}`} style={{ fontSize: 14 }}>
              El margen de <strong>{productName(a.productId)}</strong> en {channelName(a.channelId)} cayó de{" "}
              {formatPct(a.previousMarginPercent)} a {formatPct(a.currentMarginPercent)}.
            </p>
          ))}
        </section>
      )}

      {current.length === 0 ? (
        <section className="card">
          <p style={{ color: "var(--ink-soft)" }}>
            Todavía no generaste ningún período de rentabilidad basado en ventas reales (sección
            "Recalcular rentabilidad" más abajo). El ranking por margen % de ventas reales
            aparece acá una vez que lo generes.
          </p>
        </section>
      ) : (
        <section className="card stack">
          <div className="label">Mejor margen % (período {latestPeriodEnd})</div>
          {byMargin.slice(0, 5).map((s) => (
            <div key={`${s.productId}-${s.channelId}-m`} className="row">
              <span>
                {productName(s.productId)} · {channelName(s.channelId)}
              </span>
              <span className="figure">{formatPct(s.marginPercent)}</span>
            </div>
          ))}
        </section>
      )}

      {calculatorResults.length > 0 && (
        <>
          <section className="card stack">
            <div className="label">Más ganancia total (calculadora, por producto -- no acumulado de ventas)</div>
            {topByNetObtained.map((s) => (
              <div key={`${s.productId}-${s.channelId}-p`} className="row">
                <span>
                  {s.productName} · {s.channelName}
                </span>
                <span className="figure">{formatARS(s.netObtained)}</span>
              </div>
            ))}
          </section>

          <section className="card stack">
            <div className="label">Por canal (calculadora, suma por producto -- no acumulado de ventas)</div>
            {Object.entries(netObtainedByChannel).map(([channelId, agg]) => (
              <div key={channelId} className="row">
                <span>{agg.channelName}</span>
                <span className="figure">
                  {formatARS(agg.total)} ({agg.productCount} prod.)
                </span>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Recalcular rentabilidad</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Usa las ventas registradas en el período, el costo actual de cada producto y la
          comisión vigente de cada canal (Fase 3: sin recetas todavía, costo simple).
        </p>
        <GenerateProfitabilityForm />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Costo actual por producto</h2>
        {products.map((p) => (
          <ProductCostRow key={p.id} product={p} currentCost={Number((p as { current_cost: number }).current_cost)} stockItems={stockItems} />
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Precios por canal</h2>
        <SetChannelPriceForm products={products} channels={channels} />
      </section>
    </div>
  );
}

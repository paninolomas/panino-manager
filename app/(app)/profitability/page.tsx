import { listProducts, listChannels } from "../../../lib/repositories/sales.repo";
import { listStockItems, listStockItemCosts } from "../../../lib/repositories/stock.repo";
import { listLatestMarginSnapshots, getProductProfitabilityInputs, getActiveRoyaltyRate, getCommissionByChannel, getOnlinePaymentFeeByChannel } from "../../../lib/repositories/profitability.repo";
import { listExpenses } from "../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../lib/auth/session";
import { detectMarginDrops, calculateProductProfitability, calculateRequiredRevenue } from "../../../lib/services/profitability-engine";
import type { MarginSnapshot } from "../../../types/domain";
import {
  ProductCostRow,
  SetChannelPriceForm,
  GenerateProfitabilityForm,
  ProductProfitabilityTable,
  RoyaltyRateForm,
  ChannelCommissionForm,
  ChannelOnlinePaymentFeeForm,
  NewProductWithPriceForm,
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
  const [products, channels, rawSnapshots, stockItemsRaw, profitabilityRows, royaltyPercent, commissionByChannel, onlinePaymentFeeByChannel, itemCosts, expenses] = await Promise.all([
    listProducts(),
    listChannels(),
    listLatestMarginSnapshots(),
    listStockItems(),
    getProductProfitabilityInputs(),
    getActiveRoyaltyRate(),
    getCommissionByChannel(),
    getOnlinePaymentFeeByChannel(),
    listStockItemCosts(),
    listExpenses(),
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

  const alerts = detectMarginDrops({ previous, current, thresholdPoints: MARGIN_DROP_THRESHOLD });

  // "Mejor margen %", "Más ganancia total" y "Por canal" -- a pedido del
  // usuario, dejan de ser un acumulado de unidades vendidas en un período
  // (margin_snapshots) y pasan a resumir la calculadora de arriba
  // (product_profitability_inputs): no depende de haber vendido nada, es
  // "si vendo UNA unidad de cada cosa, cuál me deja más plata" en vez de
  // "cuánto dejé acumulado hasta ahora".
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

  // Los "sin costo cargado" (marginPercent null, "—" en la tabla) quedan
  // afuera del ranking -- no tiene sentido que compitan por "mejor margen"
  // cuando en realidad no hay margen real calculado, solo falta el dato.
  const topByMargin = calculatorResults
    .filter((r): r is typeof r & { marginPercent: number } => r.marginPercent !== null)
    .sort((a, b) => b.marginPercent - a.marginPercent)
    .slice(0, 5);

  const topByNetObtained = [...calculatorResults].sort((a, b) => b.netObtained - a.netObtained).slice(0, 5);

  const netObtainedByChannel: Record<string, { channelName: string; total: number; productCount: number }> = {};
  for (const r of calculatorResults) {
    const entry = (netObtainedByChannel[r.channelId] ??= { channelName: r.channelName, total: 0, productCount: 0 });
    entry.total += r.netObtained;
    entry.productCount += 1;
  }

  // "¿Necesito vender más para tener utilidades?" -- gastos de TODO lo
  // cargado en el mes actual (todos los estados, tal cual confirmó el
  // usuario, sin distinguir fijo/variable) contra el margen de
  // contribución PROMEDIO del mix de productos. Es una aproximación de
  // referencia (promedio simple, no pesado por volumen real de venta),
  // documentado en el comentario de calculateRequiredRevenue.
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = monthEndDate.toISOString().slice(0, 10);
  const monthLabel = now.toLocaleDateString("es-AR", { month: "long", year: "numeric" });

  const expensesThisMonth = (expenses ?? []).filter((e) => e.date >= monthStart && e.date <= monthEnd);
  const totalExpensesThisMonth = expensesThisMonth.reduce((sum, e) => sum + Number(e.amount), 0);

  const contributionRatios = calculatorResults
    .filter((r) => r.cost > 0 && r.price > 0)
    .map((r) => (r.netObtained - r.cost) / r.price);
  const avgContributionMarginRatio =
    contributionRatios.length > 0 ? contributionRatios.reduce((a, b) => a + b, 0) / contributionRatios.length : 0;

  const requiredRevenue = calculateRequiredRevenue(totalExpensesThisMonth, avgContributionMarginRatio);

  return (
    <div className="stack">
      <h1>Rentabilidad</h1>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Agregar producto</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Crea el producto y, si le cargás precio de una, lo deja visible directo en la tabla de
          abajo -- sin precio en algún canal, un producto no aparece ahí (sí en "Costo actual por
          producto", más abajo).
        </p>
        <NewProductWithPriceForm channels={channels} />
      </section>

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

      {calculatorResults.length > 0 && (
        <>
          <section className="card stack">
            <div className="label">Mejor margen % (calculadora, por producto -- no acumulado de ventas)</div>
            {topByMargin.map((s) => (
              <div key={`${s.productId}-${s.channelId}-m`} className="row">
                <span>
                  {s.productName} · {s.channelName}
                </span>
                <span className="figure">{formatPct(s.marginPercent)}</span>
              </div>
            ))}
          </section>

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
        <div className="label">¿Necesito vender más? (gastos de {monthLabel} vs. margen de contribución)</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Gastos cargados en {monthLabel} ÷ margen de contribución promedio de tus productos
          (precio − costo − comisión − regalía − pago en línea − descuento, medido sobre el precio
          de venta). Es un promedio simple entre productos, no pesado por volumen real de venta —
          si vendés más de los que dejan mejor margen, en la práctica necesitás facturar menos que
          esto.
        </p>
        <div className="row">
          <span>Gastos cargados en {monthLabel}</span>
          <span className="figure">{formatARS(totalExpensesThisMonth)}</span>
        </div>
        <div className="row">
          <span>Margen de contribución promedio ({contributionRatios.length} producto{contributionRatios.length === 1 ? "" : "s"} con costo cargado)</span>
          <span className="figure">{formatPct(avgContributionMarginRatio)}</span>
        </div>
        <div className="row" style={{ fontWeight: 600 }}>
          <span>Facturación necesaria para cubrir {monthLabel}</span>
          <span className="figure" style={{ color: requiredRevenue === null ? "var(--risk)" : undefined }}>
            {requiredRevenue === null ? "No alcanza con ningún volumen (margen promedio ≤ 0)" : formatARS(requiredRevenue)}
          </span>
        </div>
      </section>

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
          <ProductCostRow
            key={p.id}
            product={p}
            currentCost={Number((p as { current_cost: number }).current_cost)}
            stockItems={stockItems}
            allProducts={products}
          />
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Precios por canal</h2>
        <SetChannelPriceForm products={products} channels={channels} />
      </section>
    </div>
  );
}

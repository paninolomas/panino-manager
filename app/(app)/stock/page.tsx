import { listStockItems, listStockMovements } from "../../../lib/repositories/stock.repo";
import { requireSession } from "../../../lib/auth/session";
import {
  estimateDailyConsumption,
  calculateCoverage,
  calculateStockLevel,
  buildPurchaseRecommendations,
  sortByPurchasePriority,
} from "../../../lib/services/stock-engine";
import { NewStockItemForm, StockMovementForm, StockItemEditToggle, StockMovementsList } from "../../../components/domain/StockForms";

const CONFIDENCE_LABEL: Record<string, string> = {
  real: "🟢 Real",
  manual: "🔵 Manual",
  estimado: "🟡 Estimado",
  insuficiente: "🔴 Insuficiente",
};

const PRIORITY_PILL: Record<string, string> = {
  alta: "pill-risk",
  media: "pill-warning",
  baja: "pill-positive",
  revisar: "pill-warning",
};

export default async function StockPage() {
  const profile = await requireSession();
  const [items, movements] = await Promise.all([listStockItems(), listStockMovements()]);

  const asOfDate = new Date().toISOString().slice(0, 10);
  const movementsByItem: Record<string, typeof movements> = {};
  for (const m of movements) {
    (movementsByItem[m.stockItemId] ??= []).push(m);
  }

  const itemsWithLevel = items.map((i) => ({
    ...i,
    currentStock: calculateStockLevel(movementsByItem[i.id] ?? []),
  }));

  const recommendations = sortByPurchasePriority(
    buildPurchaseRecommendations({
      items: itemsWithLevel.map((i) => ({
        stockItemId: i.id,
        currentStock: i.currentStock,
        safetyStock: Number(i.safety_stock),
      })),
      movementsByItem,
      asOfDate,
      consumptionWindowDays: 14,
      purchaseHorizonDays: 3,
    })
  );

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? "—";
  const itemUnit = (id: string) => items.find((i) => i.id === id)?.unit ?? "";

  return (
    <div className="stack">
      <h1>Stock</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Sin recetas todavía — el consumo se estima desde el historial de salidas registradas, no
        desde las ventas. Con menos de 3 días distintos de historial, el sistema no estima:
        muestra "Insuficiente" en vez de inventar un número.
      </p>

      <section className="card stack">
        <div className="label">Cobertura por insumo</div>
        {itemsWithLevel.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay insumos cargados.</p>}
        {itemsWithLevel.map((i) => {
          const consumption = estimateDailyConsumption(movementsByItem[i.id] ?? [], asOfDate, 14);
          const coverage = calculateCoverage(i.currentStock, consumption);
          return (
            <div key={i.id} className="row">
              <span>
                {i.name} · {i.currentStock} {i.unit}
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="figure">
                  {coverage.days === null ? "—" : `${coverage.days.toFixed(1)} días`}
                </span>
                <span className="pill">{CONFIDENCE_LABEL[coverage.confidence]}</span>
                {profile.role === "socio" && <StockItemEditToggle item={i} />}
              </span>
            </div>
          );
        })}
      </section>

      <section className="card stack">
        <div className="label">Compras recomendadas</div>
        {recommendations.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Nada para comprar por ahora.</p>}
        {recommendations
          .filter((r) => r.neededQuantity > 0 || r.priority === "revisar")
          .map((r) => (
            <div key={r.stockItemId} className="row">
              <span>{itemName(r.stockItemId)}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="figure">
                  {r.neededQuantity > 0 ? `${r.neededQuantity.toFixed(1)} ${itemUnit(r.stockItemId)}` : "—"}
                </span>
                <span className={`pill ${PRIORITY_PILL[r.priority]}`}>
                  {r.priority === "revisar" ? "revisar (sin historial)" : r.priority}
                </span>
              </span>
            </div>
          ))}
      </section>

      <section className="card stack">
        <div className="label">Últimos movimientos</div>
        <StockMovementsList movements={movements} itemName={itemName} itemUnit={itemUnit} />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Registrar movimiento</h2>
        <StockMovementForm items={items} />
      </section>

      {profile.role === "socio" && (
        <section className="card stack">
          <h2 style={{ fontSize: 16 }}>Nuevo insumo</h2>
          <NewStockItemForm />
        </section>
      )}
    </div>
  );
}

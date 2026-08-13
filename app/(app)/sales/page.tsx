import { listChannels, listProducts, listSalesProducts } from "../../../lib/repositories/sales.repo";
import { listStockItems, listStockItemCosts } from "../../../lib/repositories/stock.repo";
import { requireSession } from "../../../lib/auth/session";
import { NewSaleForm, NewProductForm, ProductsList, DailyClosingForm } from "../../../components/domain/SalesForms";

export default async function SalesPage() {
  const profile = await requireSession();
  // Fase 1.1 item 1: el empleado nunca consulta la tabla products directamente
  // (RLS se lo impide) -- usa la función segura que no expone current_cost.
  const [channels, products, stockItemsRaw, itemCosts] = await Promise.all([
    listChannels(),
    profile.role === "socio" ? listProducts() : listSalesProducts(),
    profile.role === "socio" ? listStockItems() : Promise.resolve([]),
    profile.role === "socio" ? listStockItemCosts() : Promise.resolve({} as Record<string, number>),
  ]);
  // El costo se fusiona acá (no en RecipeEditor) para que el preview en vivo
  // de la receta funcione desde el primer tipeo, sin depender de que la
  // receta ya esté guardada -- ver comentario en RecipeEditor.
  const stockItems = stockItemsRaw.map((i) => ({ ...i, unitCost: itemCosts[i.id] ?? 0 }));

  return (
    <div className="stack">
      <h1>Ventas</h1>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Cierre rápido del día</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Para los días que no da el tiempo de cargar venta por venta: pedidos + monto total del
          día, ticket promedio se calcula solo. Alimenta el objetivo semanal, pero no genera
          movimiento de caja ni afecta Rentabilidad — para eso seguí usando "Registrar venta" o
          "Ventas por período".
        </p>
        <DailyClosingForm />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Registrar venta</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Fase 1 registra la venta (pedido + productos). Todavía no genera automáticamente el
          movimiento de caja ni la liquidación — eso es parte del motor financiero de Fase 2.
        </p>
        <NewSaleForm channels={channels} products={products} />
      </section>

      {profile.role === "socio" && (
        <section className="card stack">
          <h2 style={{ fontSize: 16 }}>Productos</h2>
          <ProductsList products={products as { id: string; name: string; current_cost: number }[]} channels={channels} stockItems={stockItems} />
          <hr className="ticket-rule" />
          <NewProductForm />
        </section>
      )}
    </div>
  );
}

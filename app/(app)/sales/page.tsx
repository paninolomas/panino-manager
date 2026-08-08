import { listChannels, listProducts, listSalesProducts } from "../../../lib/repositories/sales.repo";
import { listStockItems } from "../../../lib/repositories/stock.repo";
import { requireSession } from "../../../lib/auth/session";
import { NewSaleForm, NewProductForm, ProductsList } from "../../../components/domain/SalesForms";

export default async function SalesPage() {
  const profile = await requireSession();
  // Fase 1.1 item 1: el empleado nunca consulta la tabla products directamente
  // (RLS se lo impide) -- usa la función segura que no expone current_cost.
  const [channels, products, stockItems] = await Promise.all([
    listChannels(),
    profile.role === "socio" ? listProducts() : listSalesProducts(),
    profile.role === "socio" ? listStockItems() : Promise.resolve([]),
  ]);

  return (
    <div className="stack">
      <h1>Ventas</h1>

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

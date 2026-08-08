import { listChannels, listProducts, listSalesProducts } from "../../../lib/repositories/sales.repo";
import { requireSession } from "../../../lib/auth/session";
import { NewSaleForm, NewProductForm } from "../../../components/domain/SalesForms";

export default async function SalesPage() {
  const profile = await requireSession();
  // Fase 1.1 item 1: el empleado nunca consulta la tabla products directamente
  // (RLS se lo impide) -- usa la función segura que no expone current_cost.
  const [channels, products] = await Promise.all([
    listChannels(),
    profile.role === "socio" ? listProducts() : listSalesProducts(),
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
          {(products as { id: string; name: string; current_cost: number }[]).map((p) => (
            <div key={p.id} className="row">
              <span>{p.name}</span>
              <span className="figure" style={{ color: "var(--ink-soft)" }}>
                costo ${p.current_cost}
              </span>
            </div>
          ))}
          <hr className="ticket-rule" />
          <NewProductForm />
        </section>
      )}
    </div>
  );
}

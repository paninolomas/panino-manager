import { listSuppliers, listObligations } from "../../../lib/repositories/suppliers.repo";
import { requireSession } from "../../../lib/auth/session";
import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { NewSupplierForm, NewObligationForm, SuppliersList, ObligationRow } from "../../../components/domain/SupplierForms";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function SuppliersPage() {
  const profile = await requireSession();
  const [suppliers, obligations] = await Promise.all([listSuppliers(), listObligations()]);
  const accounts = profile.role === "socio" ? await listAccounts() : [];
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name;

  return (
    <div className="stack">
      <h1>Proveedores</h1>

      <section className="card stack">
        <div className="label">Próximos pagos</div>
        {obligations.filter((o) => o.status === "pending").length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>No hay obligaciones pendientes.</p>
        )}
        {profile.role === "socio"
          ? obligations
              .filter((o) => o.status === "pending")
              .map((o) => (
                <ObligationRow key={o.id} obligation={o} supplierName={supplierName(o.supplierId) ?? "—"} accounts={accounts} />
              ))
          : obligations
              .filter((o) => o.status === "pending")
              .map((o) => (
                <div key={o.id} className="row" style={{ alignItems: "center" }}>
                  <span>
                    {supplierName(o.supplierId) ?? "—"} · <span style={{ color: "var(--ink-soft)" }}>vence {o.estimatedDueDate}</span>
                  </span>
                  <span className="figure">{formatARS(o.amount)}</span>
                </div>
              ))}
      </section>

      <section className="card stack">
        <div className="label">Proveedores</div>
        {profile.role === "socio" ? (
          <SuppliersList suppliers={suppliers} />
        ) : (
          suppliers.map((s) => (
            <div key={s.id} className="row">
              <span>{s.name}</span>
              <span className="pill">{s.default_payment_terms_days} días</span>
            </div>
          ))
        )}
      </section>

      {profile.role === "socio" && (
        <>
          <section className="card stack">
            <h2 style={{ fontSize: 16 }}>Nuevo proveedor</h2>
            <NewSupplierForm />
          </section>
          <section className="card stack">
            <h2 style={{ fontSize: 16 }}>Nueva obligación</h2>
            <NewObligationForm suppliers={suppliers} />
          </section>
        </>
      )}
    </div>
  );
}

import { listAuditLog } from "../../../lib/repositories/audit.repo";
import { requireSocio } from "../../../lib/auth/session";

export default async function AuditPage() {
  await requireSocio();
  const entries = await listAuditLog();

  return (
    <div className="stack">
      <h1>Auditoría</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Registro de cambios sobre costos, precios, gastos, proveedores, obligaciones y reglas de
        cobro. Los movimientos de caja no aparecen acá como "modificaciones" porque nunca se
        editan — cualquier corrección es un movimiento nuevo, visible en "Movimientos".
      </p>

      <section className="card stack">
        {entries.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin cambios registrados todavía.</p>}
        {entries.map((e) => (
          <div key={e.id} className="stack" style={{ borderBottom: "1px dashed var(--line)", paddingBottom: 8 }}>
            <div className="row">
              <span className="label">
                {e.table_name}.{e.field}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {new Date(e.changed_at).toLocaleString("es-AR")}
              </span>
            </div>
            <div style={{ fontSize: 14 }}>
              <span style={{ color: "var(--risk)" }}>{e.old_value ?? "—"}</span>
              {" → "}
              <span style={{ color: "var(--positive)" }}>{e.new_value ?? "—"}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

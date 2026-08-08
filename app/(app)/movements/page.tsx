import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { listMovements } from "../../../lib/repositories/movements.repo";
import { ManualMovementForm, TransferForm } from "../../../components/domain/MovementForms";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function MovementsPage() {
  const [accounts, movements] = await Promise.all([listAccounts(), listMovements()]);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="stack">
      <h1>Movimientos</h1>

      <section className="card stack">
        <div className="label">Últimos movimientos</div>
        {movements.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Sin movimientos todavía.</p>}
        {movements.slice(0, 30).map((m) => (
          <div key={m.id} className="row">
            <span>
              {accountName(m.accountId)} · <span style={{ color: "var(--ink-soft)" }}>{m.originType}</span>
            </span>
            <span className="figure" style={{ color: m.direction === "egreso" ? "var(--risk)" : "var(--positive)" }}>
              {m.direction === "egreso" ? "-" : "+"}
              {formatARS(m.amount)}
            </span>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Movimiento manual</h2>
        <ManualMovementForm accounts={accounts} />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Transferencia entre cuentas</h2>
        <TransferForm accounts={accounts} />
      </section>
    </div>
  );
}

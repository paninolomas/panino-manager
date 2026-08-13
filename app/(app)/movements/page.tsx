import { listAccounts, listAccountBalances } from "../../../lib/repositories/accounts.repo";
import { listMovements } from "../../../lib/repositories/movements.repo";
import { ManualMovementForm, TransferForm, MovementsList } from "../../../components/domain/MovementForms";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function MovementsPage() {
  const [accounts, movements, balances] = await Promise.all([listAccounts(), listMovements(), listAccountBalances()]);
  const balanceByAccount = new Map(balances.map((b) => [b.account_id, Number(b.balance)]));
  const totalBalance = balances.reduce((t, b) => t + Number(b.balance), 0);

  return (
    <div className="stack">
      <h1>Movimientos</h1>

      <section className="card stack">
        <div className="row" style={{ alignItems: "baseline" }}>
          <div className="label">Saldos por cuenta</div>
          <span className="figure">{formatARS(totalBalance)}</span>
        </div>
        {accounts.map((a) => (
          <div key={a.id} className="row" style={{ alignItems: "center" }}>
            <span>{a.name}</span>
            <span className="figure">{formatARS(balanceByAccount.get(a.id) ?? 0)}</span>
          </div>
        ))}
      </section>

      <section className="card stack">
        <div className="label">Últimos movimientos</div>
        <MovementsList movements={movements} accounts={accounts} />
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

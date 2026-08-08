import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { listMovements } from "../../../lib/repositories/movements.repo";
import { ManualMovementForm, TransferForm, MovementsList } from "../../../components/domain/MovementForms";

export default async function MovementsPage() {
  const [accounts, movements] = await Promise.all([listAccounts(), listMovements()]);

  return (
    <div className="stack">
      <h1>Movimientos</h1>

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

import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { NewAccountForm, OpeningBalanceForm } from "../../../components/domain/AccountForms";

export default async function AccountsPage() {
  const accounts = await listAccounts();

  return (
    <div className="stack">
      <h1>Cuentas</h1>

      <section className="card stack">
        <div className="label">Cuentas activas</div>
        {accounts.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Todavía no hay cuentas cargadas.</p>}
        {accounts.map((a) => (
          <div key={a.id} className="row">
            <span>{a.name}</span>
            <span className="pill">{a.type}</span>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Nueva cuenta</h2>
        <NewAccountForm />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Saldo inicial</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Se carga una sola vez por cuenta y queda auditado como un movimiento más.
        </p>
        <OpeningBalanceForm accounts={accounts} />
      </section>
    </div>
  );
}

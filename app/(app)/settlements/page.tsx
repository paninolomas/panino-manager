import { listChannels } from "../../../lib/repositories/sales.repo";
import { listAccounts } from "../../../lib/repositories/accounts.repo";
import { listPendingSettlements, listPendingCommissionCharges } from "../../../lib/repositories/settlements.repo";
import { getActiveReserveTarget } from "../../../lib/repositories/reserve.repo";
import { requireSocio } from "../../../lib/auth/session";
import {
  GenerateSettlementForm,
  CollectSettlementButton,
  PayCommissionButton,
  AdvanceSimulatorForm,
  ReserveTargetForm,
} from "../../../components/domain/SettlementForms";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

export default async function SettlementsPage() {
  await requireSocio();
  const [channels, accounts, settlements, commissions, reserve] = await Promise.all([
    listChannels(),
    listAccounts(),
    listPendingSettlements(),
    listPendingCommissionCharges(),
    getActiveReserveTarget(),
  ]);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="stack">
      <h1>Liquidaciones</h1>

      <section className="card stack">
        <div className="label">Pendientes de cobro</div>
        {settlements.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay liquidaciones pendientes.</p>}
        {settlements.map((s) => (
          <div key={s.id} className="stack" style={{ borderBottom: "1px dashed var(--line)", paddingBottom: 8 }}>
            <div className="row">
              <span>
                {channelName(s.channel_id)} · {s.period_start} → {s.period_end}
              </span>
              <span className="figure">{formatARS(Number(s.net_amount))}</span>
            </div>
            <div className="row">
              <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                bruto {formatARS(Number(s.gross_amount))} · comisión {formatARS(Number(s.commission_amount))} · vence{" "}
                {s.expected_payment_date}
              </span>
              <CollectSettlementButton settlementId={s.id} accounts={accounts} />
            </div>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Generar liquidación (PedidosYa / Rappi)</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Agrupa las ventas sin liquidar del canal en el período elegido, calcula la comisión y
          el monto neto, y arma el cobro esperado.
        </p>
        <GenerateSettlementForm channels={channels} />
      </section>

      <section className="card stack">
        <div className="label">Comisiones de Pedix pendientes</div>
        {commissions.length === 0 && <p style={{ color: "var(--ink-soft)" }}>No hay comisiones pendientes.</p>}
        {commissions.map((c) => (
          <div key={c.id} className="row" style={{ alignItems: "center" }}>
            <span style={{ color: "var(--ink-soft)" }}>vence {c.estimated_payment_date}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="figure">{formatARS(Number(c.amount))}</span>
              <PayCommissionButton commissionId={c.id} accounts={accounts} />
            </span>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>¿Conviene adelantar PedidosYa?</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          El porcentaje de costo del adelanto se carga acá cada vez — nunca es un 3%+IVA fijo.
          La recomendación compara el costo contra el disponible proyectado antes de la fecha
          de cobro normal.
        </p>
        <AdvanceSimulatorForm
          settlementId={settlements[0]?.id ?? null}
          defaultNetReceivable={settlements[0] ? Number(settlements[0].net_amount) : undefined}
          defaultNormalDate={settlements[0]?.expected_payment_date}
        />
      </section>

      <section className="card stack">
        <h2 style={{ fontSize: 16 }}>Reserva mínima</h2>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Dinero que nunca se cuenta como disponible para gastar. Se usa en el cálculo de
          "Disponible real" del dashboard.
        </p>
        <ReserveTargetForm current={reserve} />
      </section>
    </div>
  );
}

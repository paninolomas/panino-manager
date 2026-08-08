import { listPendingSettlements } from "../../../lib/repositories/settlements.repo";
import { getStandardHorizons } from "../../../lib/services/cash-snapshot";
import { calculateBalancesByAccount } from "../../../lib/services/financial-engine";
import { requireSession } from "../../../lib/auth/session";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

const HORIZON_LABELS: Record<number, string> = {
  0: "Hoy",
  3: "3 días",
  7: "7 días",
  14: "14 días",
  30: "30 días",
};

export default async function DashboardPage() {
  const profile = await requireSession();

  if (profile.role !== "socio") {
    return (
      <div className="stack">
        <h1>Hola, {profile.fullName.split(" ")[0]}</h1>
        <p className="card">
          Desde acá podés cargar ventas, stock y consultar proveedores. La información de caja y
          rentabilidad es visible solo para los socios.
        </p>
      </div>
    );
  }

  const asOfDate = new Date().toISOString().slice(0, 10);
  const [{ horizons, inputs }, pendingSettlements] = await Promise.all([
    getStandardHorizons(asOfDate),
    listPendingSettlements(),
  ]);

  const balances = calculateBalancesByAccount(inputs.movements);
  const hasAnyMovement = inputs.movements.length > 0;

  return (
    <div className="stack">
      <div>
        <span className="label">Centro de decisiones</span>
        <h1>¿Cómo venimos?</h1>
      </div>

      <section className="card stack">
        <div className="label">Liquidez total</div>
        {hasAnyMovement ? (
          <div className="value-lg">{formatARS(inputs.currentLiquidity)}</div>
        ) : (
          <p style={{ color: "var(--ink-soft)" }}>
            No hay información suficiente todavía — cargá el saldo inicial de tus cuentas en
            "Cuentas" para empezar a ver este número.
          </p>
        )}
        <hr className="ticket-rule" />
        <div className="stack">
          {inputs.accounts.map((a) => (
            <div key={a.id} className="row">
              <span>{a.name}</span>
              <span className="figure">{formatARS(balances[a.id] ?? 0)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <div className="label">Disponible real, por horizonte</div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          Caja + cobros esperados − comprometido (proveedores, comisiones, recurrentes) −
          reserva ({formatARS(inputs.reserve)}), proyectado a cada plazo.
        </p>
        <hr className="ticket-rule" />
        <div className="stack">
          {horizons.map((h) => (
            <div key={h.horizonDays} className="row">
              <span>{HORIZON_LABELS[h.horizonDays]}</span>
              <span
                className="figure"
                style={{ color: h.availableReal < 0 ? "var(--risk)" : "var(--ink)" }}
              >
                {formatARS(h.availableReal)}
              </span>
            </div>
          ))}
        </div>
        {horizons.some((h) => h.availableReal < 0) && (
          <p style={{ fontSize: 13, color: "var(--risk)" }}>
            ⚠ Al menos un horizonte proyecta déficit de caja — revisá "Liquidaciones" para ver si
            conviene adelantar algún cobro pendiente, o preguntale al Copiloto "¿qué debería hacer
            hoy?".
          </p>
        )}
      </section>

      <section className="card stack">
        <div className="row">
          <span className="label">Liquidaciones pendientes de cobro</span>
          <span className="figure">
            {formatARS(pendingSettlements.reduce((t, s) => t + Number(s.net_amount), 0))}
          </span>
        </div>
        {pendingSettlements.length === 0 && (
          <p style={{ color: "var(--ink-soft)" }}>No hay liquidaciones pendientes.</p>
        )}
        {pendingSettlements.slice(0, 5).map((s) => (
          <div key={s.id} className="row">
            <span style={{ color: "var(--ink-soft)" }}>
              vence {s.expected_payment_date}
            </span>
            <span className="figure">{formatARS(Number(s.net_amount))}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

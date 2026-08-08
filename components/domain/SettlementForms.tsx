"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Channel = { id: string; name: string; settlement_model: string };
type Account = { id: string; name: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function GenerateSettlementForm({ channels }: { channels: Channel[] }) {
  const router = useRouter();
  const groupedChannels = channels.filter((c) => c.settlement_model === "grouped");
  const [channelId, setChannelId] = useState(groupedChannels[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, periodStart, periodEnd }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.toString() ?? "No se pudo generar la liquidación.");
      return;
    }
    router.refresh();
  }

  if (groupedChannels.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Canal</label>
        <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {groupedChannels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Desde</label>
        <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
      </div>
      <div className="field">
        <label>Hasta</label>
        <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Generando…" : "Generar liquidación del período"}
      </button>
    </form>
  );
}

export function CollectSettlementButton({ settlementId, accounts }: { settlementId: string; accounts: Account[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCollect() {
    if (accounts.length === 0) return;
    setLoading(true);
    const res = await fetch(`/api/settlements/${settlementId}/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accounts[0].id, date: todayISO() }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button className="btn btn-secondary" onClick={handleCollect} disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
      {loading ? "…" : `Cobrar en ${accounts[0]?.name ?? "cuenta"}`}
    </button>
  );
}

export function PayCommissionButton({ commissionId, accounts }: { commissionId: string; accounts: Account[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    if (accounts.length === 0) return;
    setLoading(true);
    const res = await fetch(`/api/commissions/${commissionId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: accounts[0].id, date: todayISO() }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button className="btn btn-secondary" onClick={handlePay} disabled={loading} style={{ padding: "4px 10px", fontSize: 13 }}>
      {loading ? "…" : `Pagar desde ${accounts[0]?.name ?? "cuenta"}`}
    </button>
  );
}

type SimResult = {
  simulation: {
    netReceivableIfWait: number;
    waitDate: string;
    netReceivableIfAdvance: number;
    advanceDate: string;
    advanceCost: number;
    costPercentApplied: number;
  };
  recommendation: { decision: "advance" | "wait"; reason: string };
};

export function AdvanceSimulatorForm({
  settlementId,
  defaultNetReceivable,
  defaultNormalDate,
}: {
  settlementId: string | null;
  defaultNetReceivable?: number;
  defaultNormalDate?: string;
}) {
  const [netReceivable, setNetReceivable] = useState(String(defaultNetReceivable ?? ""));
  const [normalPaymentDate, setNormalPaymentDate] = useState(defaultNormalDate ?? "");
  const [advanceDate, setAdvanceDate] = useState("");
  const [feePercent, setFeePercent] = useState("3");
  const [vatPercent, setVatPercent] = useState("21");
  const [projectedAvailable, setProjectedAvailable] = useState("0");
  const [result, setResult] = useState<SimResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/advance-simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settlementId,
        netReceivable: Number(netReceivable),
        normalPaymentDate,
        advanceDate,
        advanceFeePercent: Number(feePercent) / 100,
        vatPercent: Number(vatPercent) / 100,
        projectedAvailableBeforeNormalDate: Number(projectedAvailable),
      }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.toString() ?? "No se pudo simular.");
      return;
    }
    setResult(body);
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Monto a cobrar (neto)</label>
        <input type="number" required min="0.01" step="0.01" value={netReceivable} onChange={(e) => setNetReceivable(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha de cobro normal</label>
        <input type="date" required value={normalPaymentDate} onChange={(e) => setNormalPaymentDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Fecha si adelanto</label>
        <input type="date" required value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
      </div>
      <div className="field">
        <label>Costo del adelanto (%)</label>
        <input type="number" required min="0" step="0.01" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} />
      </div>
      <div className="field">
        <label>IVA sobre ese costo (%)</label>
        <input type="number" required min="0" step="0.01" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} />
      </div>
      <div className="field">
        <label>Disponible proyectado antes del cobro normal (sin este cobro)</label>
        <input type="number" required step="0.01" value={projectedAvailable} onChange={(e) => setProjectedAvailable(e.target.value)} />
        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Tomalo del horizonte más cercano a esa fecha en "Hoy".
        </span>
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Calculando…" : "Simular y guardar decisión"}
      </button>

      {result && (
        <div className="card stack" style={{ marginTop: 8 }}>
          <div className="row">
            <span>Esperar ({result.simulation.waitDate})</span>
            <span className="figure">
              {result.simulation.netReceivableIfWait.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
            </span>
          </div>
          <div className="row">
            <span>Adelantar ({result.simulation.advanceDate})</span>
            <span className="figure">
              {result.simulation.netReceivableIfAdvance.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
            </span>
          </div>
          <div className="row">
            <span style={{ color: "var(--ink-soft)" }}>Costo del adelanto</span>
            <span className="figure" style={{ color: "var(--risk)" }}>
              -{result.simulation.advanceCost.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
            </span>
          </div>
          <hr className="ticket-rule" />
          <span className={`pill ${result.recommendation.decision === "advance" ? "pill-warning" : "pill-positive"}`}>
            {result.recommendation.decision === "advance" ? "Recomendación: adelantar" : "Recomendación: esperar"}
          </span>
          <p style={{ fontSize: 13 }}>{result.recommendation.reason}</p>
        </div>
      )}
    </form>
  );
}

export function ReserveTargetForm({ current }: { current: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(current));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Number(amount) }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("No se pudo actualizar la reserva.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Reserva mínima</label>
        <input type="number" required min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Guardando…" : "Actualizar reserva"}
      </button>
    </form>
  );
}

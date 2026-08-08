"use client";

import { useMemo, useState } from "react";
import { runSimulation, PRICE_DELTA_PRESETS, VOLUME_DELTA_PRESETS, COST_DELTA_PRESETS, COMMISSION_PRESETS } from "../../lib/services/simulation-engine";
import type { SimulationBaseline } from "../../types/domain";

function formatARS(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export function SimulatorForm({ defaultFixedCosts }: { defaultFixedCosts: number }) {
  const [unitsSold, setUnitsSold] = useState("100");
  const [unitPrice, setUnitPrice] = useState("19000");
  const [unitCost, setUnitCost] = useState("10200");
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [fixedCosts, setFixedCosts] = useState(String(defaultFixedCosts));

  const [priceDelta, setPriceDelta] = useState(0);
  const [volumeDelta, setVolumeDelta] = useState(0);
  const [costDelta, setCostDelta] = useState(0);
  const [commissionOverride, setCommissionOverride] = useState<number | null>(null);

  const baseline: SimulationBaseline = useMemo(
    () => ({
      unitsSold: Number(unitsSold) || 0,
      unitPrice: Number(unitPrice) || 0,
      unitCost: Number(unitCost) || 0,
      commissionPercent: (Number(commissionPercent) || 0) / 100,
      fixedCosts: Number(fixedCosts) || 0,
    }),
    [unitsSold, unitPrice, unitCost, commissionPercent, fixedCosts]
  );

  const result = useMemo(
    () =>
      runSimulation(baseline, {
        priceDeltaPercent: priceDelta,
        volumeDeltaPercent: volumeDelta,
        costDeltaPercent: costDelta,
        commissionOverridePercent: commissionOverride ?? undefined,
      }),
    [baseline, priceDelta, volumeDelta, costDelta, commissionOverride]
  );

  return (
    <div className="stack">
      <div className="stack">
        <div className="row">
          <label style={{ fontSize: 13 }}>Unidades vendidas (período base)</label>
          <input type="number" value={unitsSold} onChange={(e) => setUnitsSold(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="row">
          <label style={{ fontSize: 13 }}>Precio</label>
          <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="row">
          <label style={{ fontSize: 13 }}>Costo</label>
          <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="row">
          <label style={{ fontSize: 13 }}>Comisión %</label>
          <input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} style={{ width: 90 }} />
        </div>
        <div className="row">
          <label style={{ fontSize: 13 }}>Costos fijos del período</label>
          <input type="number" value={fixedCosts} onChange={(e) => setFixedCosts(e.target.value)} style={{ width: 90 }} />
        </div>
      </div>

      <hr className="ticket-rule" />

      <div className="stack">
        <div className="label">Precio</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className={`pill ${priceDelta === 0 ? "pill-positive" : ""}`} onClick={() => setPriceDelta(0)}>
            sin cambio
          </button>
          {PRICE_DELTA_PRESETS.map((p) => (
            <button key={p} type="button" className={`pill ${priceDelta === p ? "pill-positive" : ""}`} onClick={() => setPriceDelta(p)}>
              +{p * 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="label">Ventas</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {VOLUME_DELTA_PRESETS.map((v) => (
            <button key={v} type="button" className={`pill ${volumeDelta === v ? "pill-positive" : ""}`} onClick={() => setVolumeDelta(v)}>
              {v > 0 ? "+" : ""}
              {v * 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="label">Costos</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className={`pill ${costDelta === 0 ? "pill-positive" : ""}`} onClick={() => setCostDelta(0)}>
            sin cambio
          </button>
          {COST_DELTA_PRESETS.map((c) => (
            <button key={c} type="button" className={`pill ${costDelta === c ? "pill-positive" : ""}`} onClick={() => setCostDelta(c)}>
              +{c * 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="label">Comisión</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" className={`pill ${commissionOverride === null ? "pill-positive" : ""}`} onClick={() => setCommissionOverride(null)}>
            actual
          </button>
          {COMMISSION_PRESETS.map((c) => (
            <button key={c} type="button" className={`pill ${commissionOverride === c ? "pill-positive" : ""}`} onClick={() => setCommissionOverride(c)}>
              {c * 100}%
            </button>
          ))}
        </div>
      </div>

      <hr className="ticket-rule" />

      <div className="stack">
        <div className="row">
          <span className="label">Situación actual</span>
          <span className="label">Simulada</span>
        </div>
        <div className="row">
          <span className="figure">{formatARS(result.current.revenue)}</span>
          <span className="figure">{formatARS(result.simulated.revenue)}</span>
        </div>
        <div className="row" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          <span>Facturación</span>
          <span>Facturación</span>
        </div>

        <div className="row">
          <span className="figure" style={{ color: result.current.profit < 0 ? "var(--risk)" : "var(--ink)" }}>
            {formatARS(result.current.profit)}
          </span>
          <span className="figure" style={{ color: result.simulated.profit < 0 ? "var(--risk)" : "var(--positive)" }}>
            {formatARS(result.simulated.profit)}
          </span>
        </div>
        <div className="row" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          <span>Ganancia</span>
          <span>Ganancia</span>
        </div>

        <div className="row">
          <span className="figure">{formatPct(result.current.marginPercent)}</span>
          <span className="figure">{formatPct(result.simulated.marginPercent)}</span>
        </div>
        <div className="row" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          <span>Margen</span>
          <span>Margen</span>
        </div>

        <div className="row">
          <span className="figure">
            {result.current.breakEvenUnits === null ? "nunca" : result.current.breakEvenUnits.toFixed(0)}
          </span>
          <span className="figure">
            {result.simulated.breakEvenUnits === null ? "nunca" : result.simulated.breakEvenUnits.toFixed(0)}
          </span>
        </div>
        <div className="row" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          <span>Punto de equilibrio (unidades)</span>
          <span>Punto de equilibrio (unidades)</span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: result.delta.profit >= 0 ? "var(--positive)" : "var(--risk)" }}>
        Diferencia de ganancia: {result.delta.profit >= 0 ? "+" : ""}
        {formatARS(result.delta.profit)}
      </p>
    </div>
  );
}

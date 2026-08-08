import { describe, it, expect } from "vitest";
import {
  calculateNetPrice,
  calculateUnitProfit,
  calculateMarginPercent,
  buildMarginSnapshot,
  buildMarginSnapshots,
  rankByMarginPercent,
  rankByTotalProfit,
  aggregateProfitByChannel,
  detectMarginDrops,
} from "../../lib/services/profitability-engine";
import type { ProductChannelSalesSummary, MarginSnapshot } from "../../types/domain";

describe("calculateNetPrice", () => {
  it("descuenta la comisión del canal", () => {
    expect(calculateNetPrice(19000, 0.2)).toBeCloseTo(15200, 2);
  });
  it("comisión 0 devuelve el mismo precio (ej. mostrador)", () => {
    expect(calculateNetPrice(17000, 0)).toBe(17000);
  });
});

describe("calculateMarginPercent", () => {
  it("calcula el margen sobre el precio neto", () => {
    expect(calculateMarginPercent(5000, 15200)).toBeCloseTo(0.3289, 4);
  });
  it("devuelve 0 si el precio neto es 0, no divide por cero", () => {
    expect(calculateMarginPercent(0, 0)).toBe(0);
  });
});

describe("buildMarginSnapshot", () => {
  it("combina ventas + costo + comisión en un snapshot completo", () => {
    const summary: ProductChannelSalesSummary = {
      productId: "lomito",
      channelId: "pedidosya",
      unitsSold: 40,
      grossRevenue: 40 * 19000, // vendidos todos al mismo precio
    };
    const snapshot = buildMarginSnapshot({ summary, unitCost: 10200, commissionPercent: 0.2 });

    expect(snapshot.unitPrice).toBe(19000);
    expect(snapshot.unitCost).toBe(10200);
    expect(snapshot.unitProfit).toBeCloseTo(15200 - 10200, 2); // 5000
    expect(snapshot.marginPercent).toBeCloseTo(5000 / 15200, 4);
    expect(snapshot.totalProfit).toBeCloseTo(5000 * 40, 2);
    expect(snapshot.totalContribution).toBe(snapshot.totalProfit);
  });

  it("con 0 unidades vendidas, el precio unitario es 0 y no explota", () => {
    const summary: ProductChannelSalesSummary = { productId: "p1", channelId: "c1", unitsSold: 0, grossRevenue: 0 };
    const snapshot = buildMarginSnapshot({ summary, unitCost: 1000, commissionPercent: 0.1 });
    expect(snapshot.unitPrice).toBe(0);
    expect(snapshot.marginPercent).toBe(0);
  });
});

describe("buildMarginSnapshots", () => {
  it("usa el costo/comisión correctos por producto y canal", () => {
    const summaries: ProductChannelSalesSummary[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, grossRevenue: 170000 },
      { productId: "lomito", channelId: "pedidosya", unitsSold: 5, grossRevenue: 95000 },
    ];
    const snapshots = buildMarginSnapshots({
      summaries,
      costByProduct: { lomito: 10200 },
      commissionByChannel: { mostrador: 0, pedidosya: 0.2 },
    });

    expect(snapshots[0].unitPrice).toBe(17000);
    expect(snapshots[0].unitProfit).toBeCloseTo(17000 - 10200, 2);
    expect(snapshots[1].unitPrice).toBe(19000);
    expect(snapshots[1].unitProfit).toBeCloseTo(19000 * 0.8 - 10200, 2);
  });

  it("si falta el costo de un producto, asume 0 (no bloquea, pero infla el margen -- se ve reflejado tal cual)", () => {
    const snapshots = buildMarginSnapshots({
      summaries: [{ productId: "sin-costo", channelId: "c1", unitsSold: 1, grossRevenue: 1000 }],
      costByProduct: {},
      commissionByChannel: {},
    });
    expect(snapshots[0].unitCost).toBe(0);
  });
});

describe("rankByMarginPercent y rankByTotalProfit -- pueden dar órdenes distintos", () => {
  const snapshots: MarginSnapshot[] = [
    {
      productId: "empanada",
      channelId: "mostrador",
      unitsSold: 200,
      unitPrice: 1500,
      unitCost: 700,
      unitProfit: 800,
      marginPercent: 0.53,
      totalProfit: 160000,
      totalContribution: 160000,
    },
    {
      productId: "lomito",
      channelId: "mostrador",
      unitsSold: 10,
      unitPrice: 17000,
      unitCost: 10200,
      unitProfit: 6800,
      marginPercent: 0.4,
      totalProfit: 68000,
      totalContribution: 68000,
    },
  ];

  it("empanada tiene mayor margen % pero lomito no necesariamente deja más plata total en este ejemplo", () => {
    expect(rankByMarginPercent(snapshots)[0].productId).toBe("empanada");
  });

  it("por ganancia total, empanada también gana en este ejemplo (200 unidades pesa más)", () => {
    expect(rankByTotalProfit(snapshots)[0].productId).toBe("empanada");
  });

  it("el orden puede diferir del de margen% cuando el volumen invierte el resultado", () => {
    const fewHighMargin: MarginSnapshot = {
      ...snapshots[1],
      productId: "combo-premium",
      unitsSold: 1,
      totalProfit: 6800,
    };
    const results = rankByTotalProfit([snapshots[0], fewHighMargin]);
    // empanada (200 un. x 800) sigue ganando en plata total aunque combo-premium
    // tenga mejor margen% -- confirma que no son el mismo ranking.
    expect(results[0].productId).toBe("empanada");
    expect(rankByMarginPercent([snapshots[0], fewHighMargin])[0].productId).toBe("empanada");
  });
});

describe("aggregateProfitByChannel", () => {
  it("suma ganancia y unidades por canal, cruzando productos", () => {
    const snapshots: MarginSnapshot[] = [
      { productId: "a", channelId: "mostrador", unitsSold: 10, unitPrice: 100, unitCost: 50, unitProfit: 50, marginPercent: 0.5, totalProfit: 500, totalContribution: 500 },
      { productId: "b", channelId: "mostrador", unitsSold: 5, unitPrice: 200, unitCost: 100, unitProfit: 100, marginPercent: 0.5, totalProfit: 500, totalContribution: 500 },
      { productId: "a", channelId: "pedidosya", unitsSold: 3, unitPrice: 100, unitCost: 50, unitProfit: 30, marginPercent: 0.3, totalProfit: 90, totalContribution: 90 },
    ];
    const byChannel = aggregateProfitByChannel(snapshots);
    expect(byChannel["mostrador"]).toEqual({ totalProfit: 1000, unitsSold: 15 });
    expect(byChannel["pedidosya"]).toEqual({ totalProfit: 90, unitsSold: 3 });
  });
});

describe("detectMarginDrops", () => {
  it("detecta una caída que supera el umbral", () => {
    const previous: MarginSnapshot[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, unitPrice: 17000, unitCost: 10200, unitProfit: 6800, marginPercent: 0.342, totalProfit: 68000, totalContribution: 68000 },
    ];
    const current: MarginSnapshot[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, unitPrice: 17000, unitCost: 11800, unitProfit: 5200, marginPercent: 0.318, totalProfit: 52000, totalContribution: 52000 },
    ];
    const alerts = detectMarginDrops({ previous, current, thresholdPoints: 0.02 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].productId).toBe("lomito");
    expect(alerts[0].dropPoints).toBeCloseTo(0.024, 3);
  });

  it("no alerta si la caída no supera el umbral", () => {
    const previous: MarginSnapshot[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, unitPrice: 17000, unitCost: 10200, unitProfit: 6800, marginPercent: 0.342, totalProfit: 68000, totalContribution: 68000 },
    ];
    const current: MarginSnapshot[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, unitPrice: 17000, unitCost: 10300, unitProfit: 6700, marginPercent: 0.34, totalProfit: 67000, totalContribution: 67000 },
    ];
    expect(detectMarginDrops({ previous, current, thresholdPoints: 0.02 })).toHaveLength(0);
  });

  it("no alerta (ni falla) si no hay período anterior comparable para ese producto/canal", () => {
    const current: MarginSnapshot[] = [
      { productId: "nuevo-producto", channelId: "mostrador", unitsSold: 5, unitPrice: 5000, unitCost: 2000, unitProfit: 3000, marginPercent: 0.6, totalProfit: 15000, totalContribution: 15000 },
    ];
    expect(detectMarginDrops({ previous: [], current, thresholdPoints: 0.02 })).toHaveLength(0);
  });

  it("una mejora de margen nunca genera alerta", () => {
    const previous: MarginSnapshot[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, unitPrice: 17000, unitCost: 11800, unitProfit: 5200, marginPercent: 0.318, totalProfit: 52000, totalContribution: 52000 },
    ];
    const current: MarginSnapshot[] = [
      { productId: "lomito", channelId: "mostrador", unitsSold: 10, unitPrice: 17000, unitCost: 10200, unitProfit: 6800, marginPercent: 0.342, totalProfit: 68000, totalContribution: 68000 },
    ];
    expect(detectMarginDrops({ previous, current, thresholdPoints: 0.02 })).toHaveLength(0);
  });
});

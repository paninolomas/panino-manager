import { describe, it, expect } from "vitest";
import {
  calculateStockLevel,
  estimateDailyConsumption,
  calculateCoverage,
  calculateRecommendedPurchase,
  buildPurchaseRecommendations,
  sortByPurchasePriority,
} from "../../lib/services/stock-engine";
import type { StockMovement } from "../../types/domain";

const movement = (
  overrides: Partial<StockMovement> & Pick<StockMovement, "stockItemId" | "quantity" | "direction" | "date">
): StockMovement => ({
  id: crypto.randomUUID(),
  originType: "purchase",
  ...overrides,
});

describe("calculateStockLevel", () => {
  it("suma entradas y resta salidas, igual que la caja", () => {
    const movements = [
      movement({ stockItemId: "carne", quantity: 20, direction: "entrada", date: "2026-08-01" }),
      movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-02" }),
      movement({ stockItemId: "carne", quantity: 3, direction: "salida", date: "2026-08-03" }),
    ];
    expect(calculateStockLevel(movements)).toBe(12);
  });

  it("0 sin movimientos", () => {
    expect(calculateStockLevel([])).toBe(0);
  });
});

describe("estimateDailyConsumption -- nunca inventa datos", () => {
  it("con menos de 3 días distintos de salida, devuelve 'insuficiente' y value=0", () => {
    const movements = [
      movement({ stockItemId: "carne", quantity: 50, direction: "salida", date: "2026-08-05" }),
    ];
    const result = estimateDailyConsumption(movements, "2026-08-10", 14);
    expect(result.confidence).toBe("insuficiente");
    expect(result.value).toBe(0);
  });

  it("una sola salida MUY grande en un solo día sigue siendo insuficiente (no confunde magnitud con historial)", () => {
    const movements = [
      movement({ stockItemId: "carne", quantity: 500, direction: "salida", date: "2026-08-05" }),
    ];
    const result = estimateDailyConsumption(movements, "2026-08-10", 14);
    expect(result.confidence).toBe("insuficiente");
  });

  it("con 3+ días distintos de salida dentro de la ventana, estima el consumo diario", () => {
    const movements = [
      movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-01" }),
      movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-02" }),
      movement({ stockItemId: "carne", quantity: 4, direction: "salida", date: "2026-08-03" }),
    ];
    const result = estimateDailyConsumption(movements, "2026-08-10", 14);
    expect(result.confidence).toBe("estimado");
    expect(result.daysWithData).toBe(3);
    expect(result.value).toBeCloseTo((5 + 5 + 4) / 14, 4);
  });

  it("ignora movimientos fuera de la ventana temporal", () => {
    const movements = [
      movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-06-01" }), // muy viejo
      movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-08" }),
      movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-09" }),
    ];
    const result = estimateDailyConsumption(movements, "2026-08-10", 7);
    expect(result.daysWithData).toBe(2); // el de junio queda afuera
    expect(result.confidence).toBe("insuficiente");
  });
});

describe("calculateCoverage", () => {
  it("calcula días de cobertura cuando hay consumo confiable", () => {
    const coverage = calculateCoverage(20, { value: 5, confidence: "estimado", daysWithData: 5 });
    expect(coverage.days).toBe(4);
    expect(coverage.confidence).toBe("estimado");
  });

  it("nunca calcula cobertura sobre una estimación insuficiente", () => {
    const coverage = calculateCoverage(20, { value: 0, confidence: "insuficiente", daysWithData: 1 });
    expect(coverage.days).toBeNull();
    expect(coverage.confidence).toBe("insuficiente");
  });

  it("consumo 0 (aunque 'confiable') tampoco calcula días -- evita división por cero", () => {
    const coverage = calculateCoverage(20, { value: 0, confidence: "estimado", daysWithData: 5 });
    expect(coverage.days).toBeNull();
  });
});

describe("calculateRecommendedPurchase", () => {
  it("ejemplo del prompt original: carne 5kg, consumo proyectado 15kg, seguridad 3kg -> compra 13kg", () => {
    const rec = calculateRecommendedPurchase({
      stockItemId: "carne",
      currentStock: 5,
      consumption: { value: 5, confidence: "estimado", daysWithData: 5 }, // 5kg/día x 3 días = 15kg
      safetyStock: 3,
      horizonDays: 3,
    });
    expect(rec.projectedConsumption).toBe(15);
    expect(rec.neededQuantity).toBe(13); // 15 + 3 - 5
  });

  it("si ya hay más stock que lo necesario, la compra recomendada es 0 (nunca negativa)", () => {
    const rec = calculateRecommendedPurchase({
      stockItemId: "pan",
      currentStock: 100,
      consumption: { value: 5, confidence: "estimado", daysWithData: 5 },
      safetyStock: 5,
      horizonDays: 3,
    });
    expect(rec.neededQuantity).toBe(0);
  });

  it("prioridad 'alta' cuando la cobertura es menor a 3 días", () => {
    const rec = calculateRecommendedPurchase({
      stockItemId: "carne",
      currentStock: 4,
      consumption: { value: 5, confidence: "estimado", daysWithData: 5 }, // cobertura 0.8 días
      safetyStock: 0,
      horizonDays: 3,
    });
    expect(rec.priority).toBe("alta");
  });

  it("prioridad 'baja' cuando la cobertura es amplia", () => {
    const rec = calculateRecommendedPurchase({
      stockItemId: "pan",
      currentStock: 100,
      consumption: { value: 2, confidence: "estimado", daysWithData: 5 }, // cobertura 50 días
      safetyStock: 5,
      horizonDays: 3,
    });
    expect(rec.priority).toBe("baja");
  });

  it("prioridad 'revisar' (nunca 'alta' inventada) cuando la confianza es insuficiente", () => {
    const rec = calculateRecommendedPurchase({
      stockItemId: "queso",
      currentStock: 2,
      consumption: { value: 0, confidence: "insuficiente", daysWithData: 1 },
      safetyStock: 1,
      horizonDays: 3,
    });
    expect(rec.priority).toBe("revisar");
    expect(rec.confidence).toBe("insuficiente");
  });
});

describe("buildPurchaseRecommendations + sortByPurchasePriority", () => {
  it("arma la lista completa y la ordena por urgencia", () => {
    const movementsByItem: Record<string, ReturnType<typeof movement>[]> = {
      carne: [
        movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-08" }),
        movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-09" }),
        movement({ stockItemId: "carne", quantity: 5, direction: "salida", date: "2026-08-10" }),
      ],
      pan: [
        movement({ stockItemId: "pan", quantity: 1, direction: "salida", date: "2026-08-08" }),
        movement({ stockItemId: "pan", quantity: 1, direction: "salida", date: "2026-08-09" }),
        movement({ stockItemId: "pan", quantity: 1, direction: "salida", date: "2026-08-10" }),
      ],
      queso: [], // sin historial -> insuficiente
    };

    const recs = buildPurchaseRecommendations({
      items: [
        { stockItemId: "carne", currentStock: 3, safetyStock: 2 }, // poco stock, consumo alto -> alta
        { stockItemId: "pan", currentStock: 200, safetyStock: 10 }, // mucho stock -> baja
        { stockItemId: "queso", currentStock: 1, safetyStock: 1 }, // sin historial -> revisar
      ],
      movementsByItem,
      asOfDate: "2026-08-10",
      consumptionWindowDays: 14,
      purchaseHorizonDays: 3,
    });

    expect(recs).toHaveLength(3);
    const sorted = sortByPurchasePriority(recs);
    expect(sorted[0].stockItemId).toBe("carne"); // alta primero
    expect(sorted.map((r) => r.priority)).toEqual(["alta", "baja", "revisar"]);
  });
});

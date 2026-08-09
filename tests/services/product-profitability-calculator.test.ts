import { describe, it, expect } from "vitest";
import { calculateProductProfitability } from "../../lib/services/profitability-engine";

describe("calculateProductProfitability", () => {
  it("reproduce el ejemplo real del usuario: Sandwich Milanesa", () => {
    // Costo 6815,74 / Precio 18900 / Comisión PY 6615 (35%) / Regalía 756 (4%)
    // Total obtenido 11529 / Rentabilidad 169,15%
    const result = calculateProductProfitability({
      price: 18900,
      cost: 6815.74,
      commissionPercent: 0.35,
      royaltyPercent: 0.04,
    });
    expect(result.commissionAmount).toBeCloseTo(6615, 0);
    expect(result.royaltyAmount).toBeCloseTo(756, 0);
    expect(result.netObtained).toBeCloseTo(11529, 0);
    expect(result.profitabilityPercent).not.toBeNull();
    expect(result.profitabilityPercent! * 100).toBeCloseTo(169.15, 1);
  });

  it("costo 0 devuelve profitabilityPercent null, no Infinity/NaN (evita mostrar un número que parece preciso sin serlo)", () => {
    const result = calculateProductProfitability({
      price: 1000,
      cost: 0,
      commissionPercent: 0.2,
      royaltyPercent: 0.04,
    });
    expect(result.profitabilityPercent).toBeNull();
  });

  it("cuando el total obtenido no llega a cubrir el costo, la rentabilidad da menos de 100% (recupera menos de lo que costó)", () => {
    const result = calculateProductProfitability({
      price: 1000,
      cost: 2000,
      commissionPercent: 0.35,
      royaltyPercent: 0.04,
    });
    expect(result.profitabilityPercent).not.toBeNull();
    expect(result.profitabilityPercent!).toBeLessThan(1);
  });
});

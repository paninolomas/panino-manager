import { describe, it, expect } from "vitest";
import { calculateProductProfitability } from "../../lib/services/profitability-engine";

describe("calculateProductProfitability", () => {
  it("reproduce el ejemplo real del usuario: Sandwich Milanesa (sin servicio de pago en línea configurado, 0%)", () => {
    // Costo 6815,74 / Precio 18900 / Comisión PY 6615 (35%) / Regalía 756 (4%)
    // Total obtenido 11529 / Rentabilidad 169,15%
    const result = calculateProductProfitability({
      price: 18900,
      cost: 6815.74,
      commissionPercent: 0.35,
      royaltyPercent: 0.04,
      onlinePaymentFeePercent: 0,
      discountPercent: 0,
    });
    expect(result.commissionAmount).toBeCloseTo(6615, 0);
    expect(result.royaltyAmount).toBeCloseTo(756, 0);
    expect(result.onlinePaymentFeeAmount).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.netObtained).toBeCloseTo(11529, 0);
    expect(result.profitabilityPercent).not.toBeNull();
    expect(result.profitabilityPercent! * 100).toBeCloseTo(169.15, 1);
    // Margen = ganancia / precio neto = (11529 - 6815.74) / 11529 = 40.87%
    expect(result.marginPercent).not.toBeNull();
    expect(result.marginPercent! * 100).toBeCloseTo(40.87, 1);
  });

  it("con servicio de pago en línea (Fase 16), resta un tercer cargo antes de comisión/regalía", () => {
    // Ejemplo real: Lomo grande + papas, subtotal 24.000, comisión 14,08%, pago en línea = 675.84/24000
    const result = calculateProductProfitability({
      price: 24000,
      cost: 4330.52,
      commissionPercent: 0.1408,
      royaltyPercent: 0,
      onlinePaymentFeePercent: 675.84 / 24000,
      discountPercent: 0,
    });
    expect(result.commissionAmount).toBeCloseTo(3379.2, 0);
    expect(result.onlinePaymentFeeAmount).toBeCloseTo(675.84, 1);
    // netObtained = 24000 - 3379.20 - 0 - 675.84 - 0 = 19944.96
    expect(result.netObtained).toBeCloseTo(19944.96, 1);
  });

  it("con descuento puntual de producto (Fase 18), resta un cuarto cargo antes de netObtained", () => {
    // Mismo caso base que el primer test, + 10% de descuento puntual del producto
    const result = calculateProductProfitability({
      price: 18900,
      cost: 6815.74,
      commissionPercent: 0.35,
      royaltyPercent: 0.04,
      onlinePaymentFeePercent: 0,
      discountPercent: 0.1,
    });
    expect(result.discountAmount).toBeCloseTo(1890, 0);
    // netObtained = 18900 - 6615 - 756 - 0 - 1890 = 9639
    expect(result.netObtained).toBeCloseTo(9639, 0);
  });

  it("costo 0 devuelve profitabilityPercent y marginPercent null, no un 100% artificial (sin costo cargado no hay margen real que mostrar -- mismo criterio que la tabla de Rentabilidad)", () => {
    const result = calculateProductProfitability({
      price: 1000,
      cost: 0,
      commissionPercent: 0.2,
      royaltyPercent: 0.04,
      onlinePaymentFeePercent: 0.0276,
      discountPercent: 0,
    });
    expect(result.profitabilityPercent).toBeNull();
    expect(result.marginPercent).toBeNull();
  });

  it("cuando el total obtenido no llega a cubrir el costo, la rentabilidad da menos de 100% (recupera menos de lo que costó)", () => {
    const result = calculateProductProfitability({
      price: 1000,
      cost: 2000,
      commissionPercent: 0.35,
      royaltyPercent: 0.04,
      onlinePaymentFeePercent: 0.0276,
      discountPercent: 0,
    });
    expect(result.profitabilityPercent).not.toBeNull();
    expect(result.profitabilityPercent!).toBeLessThan(1);
  });
});

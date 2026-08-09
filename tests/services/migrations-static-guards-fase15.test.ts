import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 15 -- regalía de marca + comisión editable + calculadora por producto (0036)", () => {
  it("royalty_rates es una sola tasa por ubicación (aplica a las 3 marcas por igual, confirmado por el usuario) -- no por marca ni canal", () => {
    const sql = readMigration("0036_royalty_and_product_profitability_calculator.sql");
    expect(sql).toMatch(/one_active_royalty_rate_per_location\s+on royalty_rates \(location_id\)/);
  });

  it("set_royalty_rate y set_channel_commission versionan (cierran la vigente, insertan una nueva) en vez de pisar el historial", () => {
    const sql = readMigration("0036_royalty_and_product_profitability_calculator.sql");
    expect(sql).toMatch(/where location_id = current_profile_location\(\) and valid_to is null;/);
    expect(sql).toMatch(/where channel_id = p_channel_id and type = 'commission' and valid_to is null;/);
  });

  it("product_profitability_inputs no depende de ninguna venta cargada -- solo lee channel_prices/products/channel_cost_items", () => {
    const sql = readMigration("0036_royalty_and_product_profitability_calculator.sql");
    const fnBody = sql.slice(sql.indexOf("create or replace function product_profitability_inputs"));
    expect(fnBody).not.toMatch(/from orders/);
    expect(fnBody).not.toMatch(/from order_items/);
  });
});

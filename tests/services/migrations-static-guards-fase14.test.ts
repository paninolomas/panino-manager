import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 14 -- import histórico agregado por producto (0035)", () => {
  it("a diferencia de import_order (0029), SÍ inserta en order_items -- si no, no aporta nada a sales_summary_by_product_channel", () => {
    const sql = readMigration("0035_historical_product_sale_import.sql");
    expect(sql).toMatch(/insert into order_items \(order_id, product_id, quantity, unit_price\)/);
  });

  it("el external_order_number es determinístico por fecha+canal+producto -- reintentar no duplica", () => {
    const sql = readMigration("0035_historical_product_sale_import.sql");
    expect(sql).toMatch(/'HIST-' \|\| p_order_date::text \|\| '-' \|\| p_channel_id::text \|\| '-' \|\| p_product_id::text/);
  });

  it("valida que el producto pertenezca a la ubicación del usuario antes de insertar", () => {
    const sql = readMigration("0035_historical_product_sale_import.sql");
    expect(sql).toMatch(/v_product_location <> current_profile_location\(\)/);
  });
});

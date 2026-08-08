import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 3 -- guardas presentes en las migraciones", () => {
  it("set_channel_price valida que el producto pertenezca a la ubicación del usuario", () => {
    const sql = readMigration("0024_set_channel_price.sql");
    const fn = sql.slice(sql.indexOf("function set_channel_price"), sql.indexOf("grant execute"));
    expect(fn).toMatch(/v_product_location <> current_profile_location\(\)/);
  });

  it("channel_prices.select quedó filtrado por ubicación del producto (hueco cerrado en Fase 3)", () => {
    const sql = readMigration("0024_set_channel_price.sql");
    expect(sql).toMatch(/p\.location_id = current_profile_location\(\)/);
  });

  it("sales_summary_by_product_channel es de solo lectura -- no calcula margen en SQL", () => {
    const sql = readMigration("0025_profitability.sql");
    const fn = sql.slice(
      sql.indexOf("function sales_summary_by_product_channel"),
      sql.indexOf("function insert_margin_snapshots")
    );
    expect(fn).not.toMatch(/margin_percent/);
    expect(fn).not.toMatch(/unit_profit/);
    expect(fn).toMatch(/sum\(oi\.quantity\)/);
  });

  it("margin_snapshots está aislado por location_id", () => {
    const sql = readMigration("0025_profitability.sql");
    expect(sql).toMatch(/location_id = current_profile_location\(\)/);
  });

  it("insert_margin_snapshots no recalcula nada -- solo inserta lo que ya viene calculado", () => {
    const sql = readMigration("0025_profitability.sql");
    const fn = sql.slice(sql.indexOf("function insert_margin_snapshots"));
    expect(fn).not.toMatch(/\*.*commission/i);
    expect(fn).toMatch(/\(v_row->>'marginPercent'\)::numeric/);
  });
});

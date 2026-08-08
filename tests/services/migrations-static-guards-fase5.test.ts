import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 5 -- guardas presentes en las migraciones", () => {
  it("goals está aislado por location_id, no solo por has_permission", () => {
    const sql = readMigration("0027_goals.sql");
    expect(sql).toMatch(/location_id = current_profile_location\(\)/);
  });

  it("goals.insert exige created_by = auth.uid() (no se puede crear un objetivo a nombre de otro usuario)", () => {
    const sql = readMigration("0027_goals.sql");
    expect(sql).toMatch(/created_by = auth\.uid\(\)/);
  });

  it("daily_sales_series es de solo agregación -- no decide feasibility ni pondera nada", () => {
    const sql = readMigration("0028_daily_sales_series.sql");
    const fn = sql.slice(sql.indexOf("function daily_sales_series"));
    expect(fn).not.toMatch(/feasible|weekday|ponder/i);
    expect(fn).toMatch(/sum\(o\.total\)/);
    expect(fn).toMatch(/count\(\*\)/);
  });

  it("daily_sales_series respeta location_id y permiso, igual que el resto de las RPC de lectura", () => {
    const sql = readMigration("0028_daily_sales_series.sql");
    expect(sql).toMatch(/o\.location_id = current_profile_location\(\)/);
    expect(sql).toMatch(/has_permission\('movements', false\)/);
  });
});

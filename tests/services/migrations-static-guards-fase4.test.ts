import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 4 -- guardas presentes en las migraciones", () => {
  it("stock_movements es insert-only, igual que cash_movements", () => {
    const sql = readMigration("0026_stock.sql");
    expect(sql).toMatch(/revoke insert, update, delete on stock_movements from authenticated/);
  });

  it("existe protección contra doble reversión de un movimiento de stock", () => {
    const sql = readMigration("0026_stock.sql");
    expect(sql).toMatch(/one_reversal_per_stock_movement/);
    expect(sql).toMatch(/when unique_violation/);
  });

  it("create_stock_movement valida location_id del insumo", () => {
    const sql = readMigration("0026_stock.sql");
    const fn = sql.slice(sql.indexOf("function create_stock_movement"), sql.indexOf("function reverse_stock_movement"));
    expect(fn).toMatch(/v_location <> current_profile_location\(\)/);
  });

  it("reverse_stock_movement valida location_id antes de revertir", () => {
    const sql = readMigration("0026_stock.sql");
    const fn = sql.slice(sql.indexOf("function reverse_stock_movement"));
    expect(fn).toMatch(/v_location <> current_profile_location\(\)/);
  });

  it("el módulo 'stock' da acceso a socio Y empleado (a diferencia de los módulos financieros)", () => {
    const sql = readMigration("0026_stock.sql");
    expect(sql).toMatch(/\('socio', 'stock', true, true\)/);
    expect(sql).toMatch(/\('empleado', 'stock', true, true\)/);
  });

  it("los grants son explícitos por función, no un grant amplio (mismo principio de Fase 1.1)", () => {
    const sql = readMigration("0026_stock.sql");
    expect(sql).not.toMatch(/grant execute on all functions/i);
    expect(sql).toMatch(/grant execute on function create_stock_movement/);
    expect(sql).toMatch(/grant execute on function reverse_stock_movement/);
  });
});

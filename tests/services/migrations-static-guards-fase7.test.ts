import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 7 -- guardas presentes en las migraciones", () => {
  it("la deduplicación de pedidos importados es un constraint de base, no una consulta previa", () => {
    const sql = readMigration("0029_import_order.sql");
    expect(sql).toMatch(/create unique index if not exists one_order_per_channel_external_number/);
  });

  it("import_order captura unique_violation con un mensaje claro de duplicado", () => {
    const sql = readMigration("0029_import_order.sql");
    const fn = sql.slice(sql.indexOf("function import_order"));
    expect(fn).toMatch(/when unique_violation/);
    expect(fn).toMatch(/Pedido duplicado/);
  });

  it("import_order valida el total y el canal antes de insertar", () => {
    const sql = readMigration("0029_import_order.sql");
    const fn = sql.slice(sql.indexOf("function import_order"), sql.indexOf("comment on function import_order"));
    expect(fn).toMatch(/p_total <= 0/);
    expect(fn).toMatch(/v_channel_active is null/);
  });

  it("import_batches quedó aislado por location_id (hueco heredado de Fase 1 sin RLS de location)", () => {
    const sql = readMigration("0029_import_order.sql");
    expect(sql).toMatch(/location_id = current_profile_location\(\)/);
  });

  it("el grant es explícito, no un grant amplio", () => {
    const sql = readMigration("0029_import_order.sql");
    expect(sql).not.toMatch(/grant execute on all functions/i);
    expect(sql).toMatch(/grant execute on function import_order/);
  });
});

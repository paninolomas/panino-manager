import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 9 -- guardas presentes en 0032 (editar/desactivar en todos los módulos)", () => {
  it("suppliers gana columna 'active' (soft-delete, no hay DELETE real por el FK de obligations)", () => {
    const sql = readMigration("0032_editable_master_data.sql");
    expect(sql).toMatch(/alter table suppliers add column if not exists active boolean/);
  });

  it("expense_categories gana columna 'active' (soft-delete, no hay DELETE real por el FK de expenses)", () => {
    const sql = readMigration("0032_editable_master_data.sql");
    expect(sql).toMatch(/alter table expense_categories add column if not exists active boolean/);
  });

  it("goals gana policy de update Y de delete (a diferencia del resto, sin FK que lo referencie -- se permite borrar de verdad)", () => {
    const sql = readMigration("0032_editable_master_data.sql");
    expect(sql).toMatch(/create policy "goals update" on goals for update/);
    expect(sql).toMatch(/create policy "goals delete" on goals for delete/);
  });

  it("ninguna policy nueva de 0032 se salta el filtro de location_id/current_profile_location", () => {
    const sql = readMigration("0032_editable_master_data.sql");
    const goalsBlock = sql.slice(sql.indexOf('create policy "goals update"'));
    expect(goalsBlock).toMatch(/current_profile_location\(\)/);
  });
});

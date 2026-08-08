import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 12 -- revertir cobro de liquidación + eliminar manual pendiente (0034)", () => {
  it("reverse_settlement_collection exige status='collected' y limpia collection_movement_id al volver a pending", () => {
    const sql = readMigration("0034_settlement_collection_reversal.sql");
    const fnBody = sql.slice(
      sql.indexOf("create or replace function reverse_settlement_collection"),
      sql.indexOf("create or replace function delete_pending_manual_settlement")
    );
    expect(fnBody).toMatch(/status <> 'collected'/);
    expect(fnBody).toMatch(/status = 'pending', actual_payment_date = null, collection_movement_id = null/);
  });

  it("delete_pending_manual_settlement rechaza liquidaciones NO manuales (protege orders.settlement_id)", () => {
    const sql = readMigration("0034_settlement_collection_reversal.sql");
    const fnBody = sql.slice(sql.indexOf("create or replace function delete_pending_manual_settlement"));
    expect(fnBody).toMatch(/not v_settlement\.is_manual/);
  });

  it("delete_pending_manual_settlement rechaza liquidaciones ya cobradas (hay que revertir primero)", () => {
    const sql = readMigration("0034_settlement_collection_reversal.sql");
    const fnBody = sql.slice(sql.indexOf("create or replace function delete_pending_manual_settlement"));
    expect(fnBody).toMatch(/status <> 'pending'/);
  });

  it("reverse_settlement_collection reutiliza el mismo guard de doble reversión (unique_violation) que el resto de las reversiones", () => {
    const sql = readMigration("0034_settlement_collection_reversal.sql");
    expect(sql).toMatch(/when unique_violation then/);
  });
});

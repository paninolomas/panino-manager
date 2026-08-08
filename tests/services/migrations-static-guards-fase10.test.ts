import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 10 -- liquidación manual + revertir pagos ya hechos (0033)", () => {
  it("create_manual_settlement no exige ventas cargadas -- inserta directo, sin agrupar orders", () => {
    const sql = readMigration("0033_manual_settlements_and_payment_reversal.sql");
    expect(sql).toMatch(/create or replace function create_manual_settlement/);
    // A diferencia de generate_settlement (0018), no debe tocar la tabla orders.
    const fnBody = sql.slice(
      sql.indexOf("create or replace function create_manual_settlement"),
      sql.indexOf("create or replace function reverse_expense_payment")
    );
    expect(fnBody).not.toMatch(/update orders/);
    expect(fnBody).toMatch(/is_manual/);
  });

  it("reverse_expense_payment exige status='paid' antes de tocar nada (no se puede revertir lo que no se pagó)", () => {
    const sql = readMigration("0033_manual_settlements_and_payment_reversal.sql");
    const fnBody = sql.slice(
      sql.indexOf("create or replace function reverse_expense_payment"),
      sql.indexOf("create or replace function reverse_obligation_payment")
    );
    expect(fnBody).toMatch(/status <> 'paid'/);
    expect(fnBody).toMatch(/status = 'pending', paid_movement_id = null/);
  });

  it("reverse_obligation_payment resuelve la ubicación vía suppliers, no vía una columna location_id inexistente en obligations", () => {
    const sql = readMigration("0033_manual_settlements_and_payment_reversal.sql");
    const fnBody = sql.slice(sql.indexOf("create or replace function reverse_obligation_payment"));
    expect(fnBody).toMatch(/select location_id into v_supplier_location from suppliers/);
  });

  it("ambas reversiones de pago reutilizan el mismo guard de doble reversión (unique_violation) que reverse_movement (0014)", () => {
    const sql = readMigration("0033_manual_settlements_and_payment_reversal.sql");
    const occurrences = sql.match(/when unique_violation then/g) ?? [];
    expect(occurrences.length).toBe(2);
  });
});

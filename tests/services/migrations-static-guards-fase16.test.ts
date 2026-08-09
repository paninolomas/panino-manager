import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 16 -- servicio de pago en línea como cargo separado del canal (0037)", () => {
  it("agrega 'online_payment_fee' al enum ANTES de cualquier uso (misma migración, sentencia separada)", () => {
    const sql = readMigration("0037_online_payment_fee.sql");
    const alterIndex = sql.indexOf("alter type channel_cost_type add value");
    const useIndex = sql.indexOf("'online_payment_fee'", alterIndex + 10);
    expect(alterIndex).toBeGreaterThanOrEqual(0);
    expect(useIndex).toBeGreaterThan(alterIndex);
  });

  it("set_channel_online_payment_fee versiona (cierra la vigente, inserta una nueva) igual que set_channel_commission", () => {
    const sql = readMigration("0037_online_payment_fee.sql");
    const fnBody = sql.slice(sql.indexOf("create or replace function set_channel_online_payment_fee"));
    expect(fnBody).toMatch(/where channel_id = p_channel_id and type = 'online_payment_fee' and valid_to is null;/);
  });

  it("product_profitability_inputs sigue sin depender de ventas (ni orders ni order_items) después de agregar la columna nueva", () => {
    const sql = readMigration("0037_online_payment_fee.sql");
    const fnBody = sql.slice(sql.indexOf("create or replace function product_profitability_inputs"));
    expect(fnBody).not.toMatch(/from orders/);
    expect(fnBody).not.toMatch(/from order_items/);
  });

  it("impuestos NO se agrega como columna -- decisión explícita del usuario de completarlo a mano", () => {
    const sql = readMigration("0037_online_payment_fee.sql");
    expect(sql).not.toMatch(/vat_on_commission/);
  });
});

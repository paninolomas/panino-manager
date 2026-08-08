import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 2 -- guardas presentes en las migraciones", () => {
  it("generate_settlement rechaza canales que no son 'grouped'", () => {
    const sql = readMigration("0018_settlements_and_commissions.sql");
    const fn = sql.slice(sql.indexOf("function generate_settlement"), sql.indexOf("function collect_settlement"));
    expect(fn).toMatch(/v_settlement_model <> 'grouped'/);
  });

  it("collect_settlement valida location_id de la liquidación y de la cuenta", () => {
    const sql = readMigration("0018_settlements_and_commissions.sql");
    const fn = sql.slice(sql.indexOf("function collect_settlement"), sql.indexOf("function pay_commission"));
    expect(fn).toMatch(/v_settlement\.location_id <> current_profile_location\(\)/);
    expect(fn).toMatch(/v_account_location is null or v_account_location <> current_profile_location\(\)/);
  });

  it("pay_commission valida location_id vía la orden asociada", () => {
    const sql = readMigration("0018_settlements_and_commissions.sql");
    const fn = sql.slice(sql.indexOf("function pay_commission"), sql.indexOf("function record_sale"));
    expect(fn).toMatch(/v_order_location <> current_profile_location\(\)/);
  });

  it("record_sale genera CommissionCharge automáticamente para Pedix", () => {
    const sql = readMigration("0018_settlements_and_commissions.sql");
    const fn = sql.slice(sql.indexOf("function record_sale"));
    expect(fn).toMatch(/v_channel_name = 'pedix'/);
    expect(fn).toMatch(/insert into commission_charges/);
  });

  it("el costo del adelanto de PedidosYa nunca queda hardcodeado en el schema (0019 son placeholders documentados)", () => {
    const sql = readMigration("0019_channel_cost_placeholders.sql");
    expect(sql).toMatch(/PLACEHOLDERS?/i);
    expect(sql).toMatch(/AJUSTAR/);
  });

  it("advance_simulations respeta location_id, no solo has_permission", () => {
    const sql = readMigration("0022_advance_simulations_location.sql");
    expect(sql).toMatch(/location_id = current_profile_location\(\)/);
  });

  it("set_reserve_target cierra la reserva vigente antes de abrir una nueva (nunca dos activas)", () => {
    const sql = readMigration("0023_set_reserve_target.sql");
    expect(sql).toMatch(/set\s+valid_to = current_date/i);
    expect(sql).toMatch(/insert into reserve_targets/);
  });

  it("los grants de Fase 2 son explícitos por función, no un grant amplio", () => {
    const sql = readMigration("0021_fase2_grants.sql");
    expect(sql).not.toMatch(/grant execute on all functions/i);
    expect(sql).toMatch(/grant execute on function generate_settlement/i);
    expect(sql).toMatch(/grant execute on function collect_settlement/i);
    expect(sql).toMatch(/grant execute on function pay_commission/i);
    expect(sql).toMatch(/grant execute on function record_advance_decision/i);
  });
});

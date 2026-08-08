import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Estos tests NO prueban RLS real (eso requiere Postgres -- ver
 * tests/integration/rls.test.ts, marcado NOT RUN). Lo que sí prueban,
 * sin necesitar infraestructura: que las correcciones de Fase 1.1 quedaron
 * efectivamente escritas en las migraciones, no solo prometidas en un
 * comentario. Sirve como red mínima contra "documenté el fix pero se me
 * olvidó escribirlo".
 */

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Fase 1.1 -- guardas presentes en las migraciones", () => {
  it("todas las migraciones numeradas existen y están en orden sin huecos", () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const numbers = files.map((f) => parseInt(f.slice(0, 4), 10));
    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });

  it("reverse_movement ahora valida location_id de la cuenta (item 3)", () => {
    const sql = readMigration("0014_rpc_hardening.sql");
    const fn = sql.slice(sql.indexOf("function reverse_movement"), sql.indexOf("function transfer_between_accounts"));
    expect(fn).toMatch(/v_account_location/i);
    expect(fn).toMatch(/current_profile_location\(\)/i);
  });

  it("transfer_between_accounts rechaza cuentas inexistentes antes de insertar (item 6)", () => {
    const sql = readMigration("0014_rpc_hardening.sql");
    const fn = sql.slice(
      sql.indexOf("function transfer_between_accounts"),
      sql.indexOf("function record_sale")
    );
    expect(fn).toMatch(/v_loc_from is null or v_loc_to is null/i);
  });

  it("record_sale valida canal habilitado, items no vacíos, cantidad/precio y location de cada producto (item 4)", () => {
    const sql = readMigration("0014_rpc_hardening.sql");
    const fn = sql.slice(sql.indexOf("function record_sale"));
    expect(fn).toMatch(/jsonb_array_length\(p_items\) = 0/);
    expect(fn).toMatch(/v_channel_active/);
    expect(fn).toMatch(/v_qty <= 0/);
    expect(fn).toMatch(/v_price < 0/);
    expect(fn).toMatch(/v_product_location <> current_profile_location\(\)/);
  });

  it("products.current_cost nunca aparece en la función sales_products (item 1)", () => {
    const sql = readMigration("0013_sales_products_secure_function.sql");
    const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
    expect(body).not.toMatch(/current_cost/);
    expect(sql).toMatch(/has_permission\('sales', false\)/);
  });

  it("el grant amplio a 'authenticated' fue revocado y reemplazado por grants explícitos (item 7)", () => {
    const sql = readMigration("0016_execute_grants_hardening.sql");
    expect(sql).toMatch(/revoke execute on all functions in schema public from authenticated/i);
    expect(sql).toMatch(/grant execute on function pay_obligation/i);
    expect(sql).toMatch(/grant execute on function record_sale/i);
  });

  it("handle_new_user ya no confía en role/location_id de user_metadata (item 9)", () => {
    const sql = readMigration("0015_signup_role_hardening.sql");
    // Se recorta al cuerpo de la función (entre "as $$" y el "$$;" de cierre)
    // a propósito: el comentario de arriba documenta el problema viejo y
    // menciona esa misma frase a modo de explicación -- buscar en el archivo
    // completo daría un falso negativo.
    const body = sql.slice(sql.indexOf("as $$"), sql.lastIndexOf("$$;"));
    expect(body).not.toMatch(/raw_user_meta_data->>'role'/);
    expect(body).not.toMatch(/raw_user_meta_data->>'location_id'/);
    expect(body).toMatch(/'empleado'/);
  });

  it("expenses valida que el proveedor pertenezca a la misma location (item 5)", () => {
    const sql = readMigration("0012_location_integrity_guards.sql");
    expect(sql).toMatch(/guard_expense_supplier_location/);
    expect(sql).toMatch(/v_supplier_location <> new\.location_id/);
  });

  it("SUPABASE_SERVICE_ROLE_KEY no aparece en ningún archivo de código de la app (item 8)", () => {
    const { execSync } = require("node:child_process");
    const root = join(__dirname, "../..");
    let output = "";
    try {
      output = execSync(
        `grep -rl "SUPABASE_SERVICE_ROLE_KEY" --include="*.ts" --include="*.tsx" app lib components 2>/dev/null || true`,
        { cwd: root, encoding: "utf-8" }
      );
    } catch {
      output = "";
    }
    expect(output.trim()).toBe("");
  });
});

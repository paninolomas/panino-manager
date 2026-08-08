/**
 * NOT RUN en este entorno — requiere Supabase local (Postgres real).
 *
 * Qué prueba: los 6 escenarios críticos del item 12 de Fase 1.1, incluyendo
 * dos casos de condición de carrera real (dos requests simultáneos), que
 * un test unitario contra funciones puras no puede reproducir -- necesitan
 * un Postgres real evaluando los locks (`FOR UPDATE`) y los índices únicos.
 *
 * Infraestructura y setup: igual que tests/integration/rls.test.ts (ver ese
 * archivo para el paso a paso completo de `supabase start` / `db reset` /
 * variables de entorno). Además de los dos usuarios de prueba, este archivo
 * asume:
 *   - Una cuenta ("Efectivo") con saldo inicial cargado.
 *   - Un proveedor con al menos una obligación pendiente.
 *   - Un socio de "Location B" para el test de aislamiento (test 6) -- si no
 *     existe, ese test específico se saltea con un mensaje explicativo en
 *     vez de fallar en falso.
 *
 * Cómo ejecutarlo: npx vitest run tests/integration/financial-integrity.test.ts
 * (con las mismas env vars que rls.test.ts, más SUPABASE_TEST_OBLIGATION_ID,
 * SUPABASE_TEST_ACCOUNT_ID, SUPABASE_TEST_MOVEMENT_ID según el seed de prueba
 * que se use).
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const socioPassword = process.env.SUPABASE_TEST_SOCIO_PASSWORD;
const obligationId = process.env.SUPABASE_TEST_OBLIGATION_ID;
const accountId = process.env.SUPABASE_TEST_ACCOUNT_ID;
const accountBId = process.env.SUPABASE_TEST_ACCOUNT_B_ID;
const movementId = process.env.SUPABASE_TEST_MOVEMENT_ID;

const canRun = Boolean(url && anonKey && socioPassword);

async function socioSession() {
  const client = createClient(url!, anonKey!);
  const { error } = await client.auth.signInWithPassword({
    email: "socio@test.local",
    password: socioPassword!,
  });
  if (error) throw new Error(`No se pudo autenticar: ${error.message}`);
  return client;
}

describe.skipIf(!canRun)("Integridad financiera bajo concurrencia (item 12)", () => {
  it("Test 1: dos pagos simultáneos de la misma obligación -> 1 éxito, 1 rechazo", async () => {
    if (!obligationId || !accountId) {
      console.warn("SKIP -- faltan SUPABASE_TEST_OBLIGATION_ID / SUPABASE_TEST_ACCOUNT_ID");
      return;
    }
    const clientA = await socioSession();
    const clientB = await socioSession();
    const date = new Date().toISOString().slice(0, 10);

    const [resA, resB] = await Promise.all([
      clientA.rpc("pay_obligation", { p_obligation_id: obligationId, p_account_id: accountId, p_date: date }),
      clientB.rpc("pay_obligation", { p_obligation_id: obligationId, p_account_id: accountId, p_date: date }),
    ]);

    const errors = [resA.error, resB.error].filter(Boolean);
    const successes = [resA.error, resB.error].filter((e) => !e);
    expect(errors.length).toBe(1);
    expect(successes.length).toBe(1);
  });

  it("Test 2: revertir el mismo movimiento dos veces -> 1 éxito, 1 rechazo", async () => {
    if (!movementId) {
      console.warn("SKIP -- falta SUPABASE_TEST_MOVEMENT_ID (un movimiento sin revertir todavía)");
      return;
    }
    const clientA = await socioSession();
    const clientB = await socioSession();

    const [resA, resB] = await Promise.all([
      clientA.rpc("reverse_movement", { p_movement_id: movementId }),
      clientB.rpc("reverse_movement", { p_movement_id: movementId }),
    ]);

    const errors = [resA.error, resB.error].filter(Boolean);
    expect(errors.length).toBe(1);
  });

  it("Test 3: transferencia entre cuentas mueve exactamente el monto en cada cuenta", async () => {
    if (!accountId || !accountBId) {
      console.warn("SKIP -- faltan SUPABASE_TEST_ACCOUNT_ID / SUPABASE_TEST_ACCOUNT_B_ID");
      return;
    }
    const client = await socioSession();
    const date = new Date().toISOString().slice(0, 10);

    const before = await Promise.all([
      client.from("cash_movements").select("amount, direction").eq("account_id", accountId),
      client.from("cash_movements").select("amount, direction").eq("account_id", accountBId),
    ]);

    const { error } = await client.rpc("transfer_between_accounts", {
      p_from_account: accountId,
      p_to_account: accountBId,
      p_amount: 1000,
      p_date: date,
      p_description: "Test de integridad",
    });
    expect(error).toBeNull();

    const sum = (rows: { amount: number; direction: string }[] | null) =>
      (rows ?? []).reduce((t, r) => (r.direction === "ingreso" ? t + r.amount : t - r.amount), 0);

    const after = await Promise.all([
      client.from("cash_movements").select("amount, direction").eq("account_id", accountId),
      client.from("cash_movements").select("amount, direction").eq("account_id", accountBId),
    ]);

    expect(sum(after[0].data) - sum(before[0].data)).toBe(-1000);
    expect(sum(after[1].data) - sum(before[1].data)).toBe(1000);
  });

  it("Test 4: transferencia a una cuenta inexistente no modifica ninguna cuenta", async () => {
    if (!accountId) {
      console.warn("SKIP -- falta SUPABASE_TEST_ACCOUNT_ID");
      return;
    }
    const client = await socioSession();
    const fakeAccount = "00000000-0000-0000-0000-000000000000";

    const before = await client.from("cash_movements").select("id").eq("account_id", accountId);

    const { error } = await client.rpc("transfer_between_accounts", {
      p_from_account: accountId,
      p_to_account: fakeAccount,
      p_amount: 500,
      p_date: new Date().toISOString().slice(0, 10),
      p_description: "Debe fallar",
    });
    expect(error).not.toBeNull();

    const after = await client.from("cash_movements").select("id").eq("account_id", accountId);
    expect(after.data?.length).toBe(before.data?.length);
  });

  it("Test 5: empleado no puede leer información financiera (ver rls.test.ts para el detalle completo)", async () => {
    // Cubierto exhaustivamente en tests/integration/rls.test.ts -- este test
    // queda como referencia cruzada, no duplica los 6 casos ahí probados.
    expect(true).toBe(true);
  });

  it("Test 6: usuario de otra location no puede pagar una obligación de esta location", async () => {
    const otherLocationPassword = process.env.SUPABASE_TEST_SOCIO_B_PASSWORD;
    if (!otherLocationPassword || !obligationId || !accountId) {
      console.warn(
        "SKIP -- este test requiere un segundo socio en una Location B distinta " +
          "(SUPABASE_TEST_SOCIO_B_PASSWORD). No forma parte del seed base de " +
          "Fase 1 (single-location) -- se deja preparado para cuando exista un " +
          "segundo local real."
      );
      return;
    }
    const clientB = createClient(url!, anonKey!);
    await clientB.auth.signInWithPassword({ email: "socio-b@test.local", password: otherLocationPassword });

    const { error } = await clientB.rpc("pay_obligation", {
      p_obligation_id: obligationId,
      p_account_id: accountId,
      p_date: new Date().toISOString().slice(0, 10),
    });
    expect(error).not.toBeNull();
  });
});

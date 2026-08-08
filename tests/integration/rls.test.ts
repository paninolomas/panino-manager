/**
 * NOT RUN en este entorno — requiere Supabase local (Postgres real + Auth).
 *
 * Qué prueba: que RLS efectivamente bloquea a un empleado de leer datos
 * financieros, y efectivamente permite a un socio leerlos. No es un mock:
 * usa dos sesiones reales autenticadas contra un Postgres real y verifica
 * el resultado que Supabase devuelve.
 *
 * Infraestructura necesaria:
 *   - Docker corriendo
 *   - Supabase CLI instalado
 *
 * Cómo ejecutarlo:
 *   1. supabase start                         (levanta Postgres + Auth local)
 *   2. supabase db reset                       (aplica todas las migraciones + seed)
 *   3. Crear dos usuarios de prueba en Supabase Studio local
 *      (http://localhost:54323 → Authentication → Add user):
 *        - socio@test.local   / user_metadata NO es necesario (Fase 1.1: el
 *          rol nunca se toma de metadata). Después de crearlo, promoverlo
 *          manualmente en SQL editor:
 *            update profiles set role = 'socio' where id =
 *              (select id from auth.users where email = 'socio@test.local');
 *        - empleado@test.local  (se crea como 'empleado' por default, no
 *          requiere ningún paso adicional)
 *   4. export SUPABASE_TEST_URL=http://localhost:54321
 *      export SUPABASE_TEST_ANON_KEY=<anon key que imprime `supabase start`>
 *      export SUPABASE_TEST_SOCIO_PASSWORD=<la que hayas puesto>
 *      export SUPABASE_TEST_EMPLEADO_PASSWORD=<la que hayas puesto>
 *   5. npx vitest run tests/integration/rls.test.ts
 *
 * Resultado esperado: los 8 tests de abajo en verde. Si RLS tiene un agujero,
 * el test que corresponde a ese agujero falla (no da falso verde).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const socioPassword = process.env.SUPABASE_TEST_SOCIO_PASSWORD;
const empleadoPassword = process.env.SUPABASE_TEST_EMPLEADO_PASSWORD;

const canRun = Boolean(url && anonKey && socioPassword && empleadoPassword);

describe.skipIf(!canRun)("RLS -- socio vs. empleado (item 2)", () => {
  let socioClient: SupabaseClient;
  let empleadoClient: SupabaseClient;

  beforeAll(async () => {
    socioClient = createClient(url!, anonKey!);
    empleadoClient = createClient(url!, anonKey!);

    const { error: e1 } = await socioClient.auth.signInWithPassword({
      email: "socio@test.local",
      password: socioPassword!,
    });
    if (e1) throw new Error(`No se pudo autenticar socio de prueba: ${e1.message}`);

    const { error: e2 } = await empleadoClient.auth.signInWithPassword({
      email: "empleado@test.local",
      password: empleadoPassword!,
    });
    if (e2) throw new Error(`No se pudo autenticar empleado de prueba: ${e2.message}`);
  });

  it("socio puede leer cash_movements", async () => {
    const { error } = await socioClient.from("cash_movements").select("id").limit(1);
    expect(error).toBeNull();
  });

  it("empleado NO puede leer cash_movements (fila vacía, no error -- RLS filtra filas)", async () => {
    const { data, error } = await empleadoClient.from("cash_movements").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("socio puede leer expenses (incluyendo amount)", async () => {
    const { data, error } = await socioClient.from("expenses").select("id, amount").limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("empleado NO puede leer expenses", async () => {
    const { data, error } = await empleadoClient.from("expenses").select("id, amount");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("empleado NO puede leer products.current_cost directamente", async () => {
    const { data, error } = await empleadoClient.from("products").select("id, current_cost");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("empleado SÍ puede ver productos vía sales_products() sin current_cost", async () => {
    const { data, error } = await empleadoClient.rpc("sales_products");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    if (data && data.length > 0) {
      expect(data[0]).not.toHaveProperty("current_cost");
    }
  });

  it("empleado NO puede leer reserve_targets", async () => {
    const { data, error } = await empleadoClient.from("reserve_targets").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("empleado NO puede leer withdrawals", async () => {
    const { data, error } = await empleadoClient.from("withdrawals").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("empleado puede llamar record_sale (módulo sales, write)", async () => {
    const { data: channels } = await socioClient.from("channels").select("id").eq("name", "mostrador").single();
    const { data: products } = await empleadoClient.rpc("sales_products");
    if (!channels || !products || products.length === 0) {
      throw new Error("Seed insuficiente para este test -- crear al menos un producto activo");
    }
    const { error } = await empleadoClient.rpc("record_sale", {
      p_channel_id: channels.id,
      p_external_order_number: "TEST-RLS-1",
      p_items: [{ product_id: products[0].id, quantity: 1, unit_price: 1000 }],
      p_payment_method: "efectivo",
    });
    expect(error).toBeNull();
  });

  it("empleado NO puede leer audit_log", async () => {
    const { data, error } = await empleadoClient.from("audit_log").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

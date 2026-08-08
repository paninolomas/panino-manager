import { createSupabaseServerClient } from "../supabase/server";

export async function listChannels() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("channels")
    .select("id, name, settlement_model")
    .order("name");
  if (error) throw error;
  return data;
}

export async function listProducts() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, current_cost")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

/**
 * Fuente segura de productos para el flujo de ventas cuando quien pide la
 * lista no tiene permiso sobre el módulo financiero (empleado). Nunca trae
 * `current_cost` -- ver migración 0013_sales_products_secure_function.sql.
 * Usa una función RPC en vez de `.from("products")` porque RLS es por fila,
 * no por columna, y socio/empleado comparten el mismo rol de Postgres.
 */
export async function listSalesProducts() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("sales_products");
  if (error) throw error;
  return data as { id: string; name: string; category: string | null; active: boolean }[];
}

export async function createProduct(input: {
  locationId: string;
  name: string;
  category?: string;
  currentCost?: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      location_id: input.locationId,
      name: input.name,
      category: input.category ?? null,
      current_cost: input.currentCost ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Editar nombre/categoría/estado de un producto (el costo tiene su propia función, updateProductCost, más abajo, porque queda cubierta por auditoría con su propio comentario). */
export async function updateProduct(
  productId: string,
  input: { name?: string; category?: string; active?: boolean }
) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.active !== undefined) patch.active = input.active;
  const { data, error } = await supabase.from("products").update(patch).eq("id", productId).select().single();
  if (error) throw error;
  return data;
}

/**
 * Actualiza el costo actual de un producto. Queda versionado automáticamente
 * en audit_log (trigger trg_audit_products, 0009) -- nunca se pierde el valor
 * anterior, aunque esta tabla en sí no mantenga historial propio de costos
 * (a diferencia de channel_prices/reserve_targets, que sí versionan con
 * valid_from/valid_to porque varios procesos necesitan "el valor vigente a
 * tal fecha"; el costo de producto solo necesita "cuál era antes" para
 * auditoría, que ya cubre audit_log).
 */
export async function updateProductCost(productId: string, currentCost: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .update({ current_cost: currentCost })
    .eq("id", productId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordSale(input: {
  channelId: string;
  externalOrderNumber?: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  paymentMethod?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_sale", {
    p_channel_id: input.channelId,
    p_external_order_number: input.externalOrderNumber ?? null,
    p_items: input.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      unit_price: i.unitPrice,
    })),
    p_payment_method: input.paymentMethod,
  });
  if (error) throw error;
  return data;
}

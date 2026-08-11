import { createSupabaseServerClient } from "../supabase/server";
import type { StockMovement } from "../../types/domain";

export async function listStockItems() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, name, unit, min_stock, safety_stock, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

/** Costo vigente por insumo (stock_item_costs, valid_to is null) -- fuente para prellenar el formulario de costo y para el motor de recetas. Insumo sin fila acá = sin costo cargado todavía, no 0 (recipe-engine.ts ya distingue esto). */
export async function listStockItemCosts(): Promise<Record<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("stock_item_costs").select("stock_item_id, unit_cost").is("valid_to", null);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((c) => [c.stock_item_id, Number(c.unit_cost)]));
}

/** Historial de costo de un insumo -- stock_item_costs ya guarda cada versión (set_stock_item_cost, 0039, cierra sola la vigente al cargar una nueva), esto solo lee lo que ya está. */
export async function getStockItemCostHistory(stockItemId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_item_costs")
    .select("unit_cost, valid_from, valid_to")
    .eq("stock_item_id", stockItemId)
    .order("valid_from", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ value: Number(r.unit_cost), validFrom: r.valid_from as string, validTo: r.valid_to as string | null }));
}

export async function updateStockItem(
  stockItemId: string,
  input: { name?: string; unit?: string; minStock?: number; safetyStock?: number; active?: boolean }
) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.minStock !== undefined) patch.min_stock = input.minStock;
  if (input.safetyStock !== undefined) patch.safety_stock = input.safetyStock;
  if (input.active !== undefined) patch.active = input.active;
  const { data, error } = await supabase.from("stock_items").update(patch).eq("id", stockItemId).select().single();
  if (error) throw error;
  return data;
}

export async function createStockItem(input: {
  locationId: string;
  name: string;
  unit: string;
  minStock: number;
  safetyStock: number;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_items")
    .insert({
      location_id: input.locationId,
      name: input.name,
      unit: input.unit,
      min_stock: input.minStock,
      safety_stock: input.safetyStock,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listStockMovements(): Promise<StockMovement[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, stock_item_id, quantity, direction, date, origin_type")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    stockItemId: m.stock_item_id,
    quantity: Number(m.quantity),
    direction: m.direction,
    date: m.date,
    originType: m.origin_type,
  }));
}

export async function createStockMovement(input: {
  stockItemId: string;
  quantity: number;
  direction: "entrada" | "salida";
  date: string;
  originType: "purchase" | "consumption_manual" | "waste" | "adjustment";
  description?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_stock_movement", {
    p_stock_item_id: input.stockItemId,
    p_quantity: input.quantity,
    p_direction: input.direction,
    p_date: input.date,
    p_origin_type: input.originType,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}

export async function reverseStockMovement(movementId: string, description?: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("reverse_stock_movement", {
    p_movement_id: movementId,
    p_description: description ?? "Reversión",
  });
  if (error) throw error;
  return data;
}

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

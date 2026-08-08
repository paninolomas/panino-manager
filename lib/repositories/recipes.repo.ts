import { createSupabaseServerClient } from "../supabase/server";
import { updateProductCost } from "./sales.repo";
import { calculateRecipeCost } from "../services/recipe-engine";

export type RecipeLine = {
  stockItemId: string;
  stockItemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

/** Lee la receta actual de un producto vía product_recipe_with_costs (0031) -- ya trae nombre/unidad/costo unitario resuelto, no hace falta cruzar nada más acá. */
export async function getProductRecipe(productId: string): Promise<RecipeLine[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("product_recipe_with_costs", { p_product_id: productId });
  if (error) throw error;
  return (data ?? []).map((r: { stock_item_id: string; stock_item_name: string; unit: string; quantity: number; unit_cost: number }) => ({
    stockItemId: r.stock_item_id,
    stockItemName: r.stock_item_name,
    unit: r.unit,
    quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost),
  }));
}

/**
 * Reemplaza la receta completa de un producto de una sola vez -- la UI manda
 * la plantilla entera (todos los insumos del catálogo, con la cantidad que
 * el usuario cargó en cada uno; 0 o vacío = no aplica a este producto) en
 * vez de ir agregando insumo por insumo. Después de guardar, recalcula el
 * costo con recipe-engine.ts y lo persiste en products.current_cost -- así
 * profitability-engine.ts y todo lo que ya lee current_cost sigue andando
 * sin cambios, la receta es solo una forma más prolija de llegar a ese
 * número (y queda guardada para poder editarla después).
 */
export async function saveProductRecipe(
  productId: string,
  lines: { stockItemId: string; quantity: number }[],
  createdBy: string
): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { error: deleteError } = await supabase.from("product_recipe_items").delete().eq("product_id", productId);
  if (deleteError) throw deleteError;

  const toInsert = lines.filter((l) => l.quantity > 0);
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("product_recipe_items").insert(
      toInsert.map((l) => ({
        product_id: productId,
        stock_item_id: l.stockItemId,
        quantity: l.quantity,
        created_by: createdBy,
      }))
    );
    if (insertError) throw insertError;
  }

  const recipe = await getProductRecipe(productId);
  const cost = calculateRecipeCost(recipe.map((r) => ({ quantity: r.quantity, unitCost: r.unitCost })));
  await updateProductCost(productId, cost);
  return cost;
}

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

/**
 * Actualiza el costo vigente de un insumo (versionado, via set_stock_item_cost
 * 0039) y recalcula en cascada products.current_cost de TODOS los productos
 * que lo usan en su receta -- decisión confirmada con el usuario: "lo único
 * que tengo que cambiar es el costo del insumo", no reabrir cada receta a
 * mano. El cálculo en sí sigue en TypeScript puro (calculateRecipeCost),
 * la función SQL solo versiona el dato y devuelve qué productos tocar.
 */
export async function setStockItemCost(
  stockItemId: string,
  unitCost: number
): Promise<{ productId: string; productName: string; cost: number }[]> {
  const supabase = await createSupabaseServerClient();

  const { error: costError } = await supabase.rpc("set_stock_item_cost", {
    p_stock_item_id: stockItemId,
    p_unit_cost: unitCost,
  });
  if (costError) throw costError;

  const { data: affected, error: affectedError } = await supabase.rpc("products_using_stock_item", {
    p_stock_item_id: stockItemId,
  });
  if (affectedError) throw affectedError;

  const results: { productId: string; productName: string; cost: number }[] = [];
  for (const row of (affected ?? []) as { product_id: string; product_name: string }[]) {
    const recipe = await getProductRecipe(row.product_id);
    const cost = calculateRecipeCost(recipe.map((r) => ({ quantity: r.quantity, unitCost: r.unitCost })));
    await updateProductCost(row.product_id, cost);
    results.push({ productId: row.product_id, productName: row.product_name, cost });
  }
  return results;
}

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
 * Todas las recetas de todos los productos activos, aplanadas en filas
 * (una por producto x insumo), para el export de "Recetas" -- no hay un
 * solo RPC para esto (product_recipe_with_costs es por producto), así que
 * se arma en TS con un Promise.all. N+1 queries, pero es un botón de
 * exportar que se toca ocasionalmente, no un endpoint de carga de página.
 */
export async function getAllRecipesForExport(): Promise<
  { productId: string; productName: string; stockItemId: string; stockItemName: string; unit: string; quantity: number; unitCost: number; lineCost: number }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase.from("products").select("id, name").eq("active", true).order("name");
  if (error) throw error;

  const rows: { productId: string; productName: string; stockItemId: string; stockItemName: string; unit: string; quantity: number; unitCost: number; lineCost: number }[] = [];
  const recipesPerProduct = await Promise.all((products ?? []).map((p) => getProductRecipe(p.id)));
  (products ?? []).forEach((p, i) => {
    for (const line of recipesPerProduct[i]) {
      rows.push({
        productId: p.id,
        productName: p.name,
        stockItemId: line.stockItemId,
        stockItemName: line.stockItemName,
        unit: line.unit,
        quantity: line.quantity,
        unitCost: line.unitCost,
        lineCost: line.quantity * line.unitCost,
      });
    }
  });
  return rows;
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

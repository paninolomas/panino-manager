/**
 * Fase 8 dejó la tabla (product_recipe_items/stock_item_costs) y la función
 * de lectura (product_recipe_with_costs, 0031) pero nunca este motor -- acá
 * es donde efectivamente se calcula el costo, en TypeScript puro, nunca en
 * SQL, mismo principio que financial-engine.ts/profitability-engine.ts.
 */

export interface RecipeLineInput {
  quantity: number;
  unitCost: number;
}

/** Suma cantidad × costo unitario de cada insumo. Redondea solo al final (2 decimales), nunca en cada línea, para no arrastrar error de redondeo en insumos de cantidades chicas (ej. sal fina 0,002 kg). */
export function calculateRecipeCost(items: RecipeLineInput[]): number {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  return Math.round(total * 100) / 100;
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setStockItemCost } from "../../../../../lib/repositories/recipes.repo";
import { requireSocio } from "../../../../../lib/auth/session";

// El costo del insumo es info sensible (mismo criterio que el resto de
// 'expenses' en la app) -- socio, no empleado, aunque el resto del módulo
// de Stock (cantidades, movimientos) sí sea de acceso mixto.
const schema = z.object({ unitCost: z.number().nonnegative() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const updatedProducts = await setStockItemCost(id, body.data.unitCost);
    return NextResponse.json({ updatedProducts }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

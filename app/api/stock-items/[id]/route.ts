import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateStockItem } from "../../../../lib/repositories/stock.repo";
import { requireSession } from "../../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  minStock: z.number().nonnegative().optional(),
  safetyStock: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 'stock' es de los pocos módulos donde el empleado también escribe (0026).
  await requireSession();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const item = await updateStockItem(id, body.data);
    return NextResponse.json(item, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

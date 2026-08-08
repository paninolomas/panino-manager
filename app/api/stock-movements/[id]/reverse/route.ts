import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reverseStockMovement } from "../../../../../lib/repositories/stock.repo";
import { requireSession } from "../../../../../lib/auth/session";

const schema = z.object({ description: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // 'stock' es el único módulo donde el empleado también puede escribir
  // (Sección 33 del prompt original, ver comentario en 0026) -- por eso acá
  // alcanza con sesión válida, no requireSocio() como en /movements/[id]/reverse.
  await requireSession();
  const { id } = await params;
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const reversalId = await reverseStockMovement(id, body.data.description);
    return NextResponse.json({ reversalId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createStockMovement } from "../../../lib/repositories/stock.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  stockItemId: z.string().uuid(),
  quantity: z.number().positive(),
  direction: z.enum(["entrada", "salida"]),
  date: z.string(),
  originType: z.enum(["purchase", "consumption_manual", "waste", "adjustment"]),
  description: z.string().optional(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const id = await createStockMovement(body.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

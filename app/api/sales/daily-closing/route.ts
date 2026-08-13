import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertDailySalesClosing } from "../../../../lib/repositories/sales.repo";
import { requireSession } from "../../../../lib/auth/session";

const schema = z.object({
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  orderCount: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const row = await upsertDailySalesClosing(body.data);
    return NextResponse.json({ row }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

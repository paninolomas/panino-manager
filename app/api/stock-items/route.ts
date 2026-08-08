import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createStockItem } from "../../../lib/repositories/stock.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  minStock: z.number().nonnegative(),
  safetyStock: z.number().nonnegative(),
});

export async function POST(req: NextRequest) {
  const profile = await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const item = await createStockItem({ ...body.data, locationId: profile.locationId });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

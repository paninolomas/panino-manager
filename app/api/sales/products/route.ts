import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createProduct } from "../../../../lib/repositories/sales.repo";
import { requireSession } from "../../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  currentCost: z.number().nonnegative().optional(),
});

export async function POST(req: NextRequest) {
  const profile = await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const product = await createProduct({ ...body.data, locationId: profile.locationId });
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

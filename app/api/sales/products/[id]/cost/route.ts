import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateProductCost } from "../../../../../../lib/repositories/sales.repo";
import { requireSession } from "../../../../../../lib/auth/session";

const schema = z.object({ currentCost: z.number().nonnegative() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const product = await updateProductCost(id, body.data.currentCost);
    return NextResponse.json(product, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

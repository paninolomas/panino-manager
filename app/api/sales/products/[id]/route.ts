import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateProduct } from "../../../../../lib/repositories/sales.repo";
import { requireSocio } from "../../../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const product = await updateProduct(id, body.data);
    return NextResponse.json(product, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

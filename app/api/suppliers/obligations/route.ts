import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createObligation } from "../../../../lib/repositories/suppliers.repo";
import { requireSession } from "../../../../lib/auth/session";

const schema = z.object({
  supplierId: z.string().uuid(),
  amount: z.number().positive(),
  purchaseDate: z.string(),
  estimatedDueDate: z.string(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const obligation = await createObligation(body.data);
    return NextResponse.json(obligation, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

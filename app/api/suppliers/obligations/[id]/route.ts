import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateObligation } from "../../../../../lib/repositories/suppliers.repo";
import { requireSocio } from "../../../../../lib/auth/session";

const schema = z.object({
  amount: z.number().positive().optional(),
  purchaseDate: z.string().optional(),
  estimatedDueDate: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const obligation = await updateObligation(id, body.data);
    return NextResponse.json(obligation, { status: 200 });
  } catch (err) {
    // Si ya está pagada, el trigger guard_obligation_immutability (0005) rechaza acá.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

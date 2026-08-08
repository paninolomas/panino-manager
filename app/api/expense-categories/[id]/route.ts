import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateExpenseCategory } from "../../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["variable", "fijo", "personal"]).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const category = await updateExpenseCategory(id, body.data);
    return NextResponse.json(category, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

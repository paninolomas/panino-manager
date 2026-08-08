import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateExpense } from "../../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../../lib/auth/session";

const schema = z.object({
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  date: z.string().optional(),
  categoryId: z.string().uuid().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const expense = await updateExpense(id, body.data);
    return NextResponse.json(expense, { status: 200 });
  } catch (err) {
    // Si ya está pagado, el trigger guard_expense_immutability (0005) rechaza acá.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

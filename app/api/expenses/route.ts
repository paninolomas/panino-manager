import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createExpense } from "../../../lib/repositories/expenses.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  categoryId: z.string().uuid(),
  description: z.string().min(1),
  amount: z.number().positive(),
  date: z.string(),
  supplierId: z.string().uuid().optional(),
  estimatedPaymentDate: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const profile = await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const expense = await createExpense({ ...body.data, locationId: profile.locationId });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

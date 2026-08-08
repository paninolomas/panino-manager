import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reverseExpensePayment } from "../../../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../../../lib/auth/session";

const schema = z.object({ description: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const reversalId = await reverseExpensePayment(id, body.data.description);
    return NextResponse.json({ reversalId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

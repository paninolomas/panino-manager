import { NextRequest, NextResponse } from "next/server";
import { unmarkExpenseAsRecurring } from "../../../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../../../lib/auth/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    await unmarkExpenseAsRecurring(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

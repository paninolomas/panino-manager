import { NextRequest, NextResponse } from "next/server";
import { markExpenseAsRecurring } from "../../../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../../../lib/auth/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    const template = await markExpenseAsRecurring(id);
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

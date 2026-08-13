import { NextRequest, NextResponse } from "next/server";
import { deleteDailySalesClosing } from "../../../../../lib/repositories/sales.repo";
import { requireSession } from "../../../../../lib/auth/session";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  try {
    await deleteDailySalesClosing(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

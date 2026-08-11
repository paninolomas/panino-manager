import { NextResponse } from "next/server";
import { getSalesPeriodItems, deleteSalesPeriod } from "../../../../lib/repositories/sales-periods.repo";
import { requireSocio } from "../../../../lib/auth/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    const items = await getSalesPeriodItems(id);
    return NextResponse.json(items, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    await deleteSalesPeriod(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

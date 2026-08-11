import { NextResponse } from "next/server";
import { getStockItemCostHistory } from "../../../../../../lib/repositories/stock.repo";
import { requireSocio } from "../../../../../../lib/auth/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    const history = await getStockItemCostHistory(id);
    return NextResponse.json(history, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

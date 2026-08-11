import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "../../../../lib/repositories/profitability.repo";
import { requireSocio } from "../../../../lib/auth/session";

export async function GET(req: NextRequest) {
  await requireSocio();
  const productId = req.nextUrl.searchParams.get("productId");
  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!productId || !channelId) return NextResponse.json({ error: "Faltan productId/channelId" }, { status: 400 });

  try {
    const history = await getPriceHistory(productId, channelId);
    return NextResponse.json(history, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

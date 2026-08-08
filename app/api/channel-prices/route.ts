import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setChannelPrice } from "../../../lib/repositories/profitability.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  productId: z.string().uuid(),
  channelId: z.string().uuid(),
  price: z.number().nonnegative(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const id = await setChannelPrice(body.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

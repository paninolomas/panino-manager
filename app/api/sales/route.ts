import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordSale } from "../../../lib/repositories/sales.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  channelId: z.string().uuid(),
  externalOrderNumber: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .min(1),
  paymentMethod: z.string().optional(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const orderId = await recordSale(body.data);
    return NextResponse.json({ orderId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

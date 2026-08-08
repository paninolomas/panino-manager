import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateSettlement } from "../../../lib/repositories/settlements.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  channelId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const id = await generateSettlement(body.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

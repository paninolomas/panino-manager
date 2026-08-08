import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { collectSettlement } from "../../../../../lib/repositories/settlements.repo";
import { requireSession } from "../../../../../lib/auth/session";

const schema = z.object({
  accountId: z.string().uuid(),
  date: z.string(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const movementId = await collectSettlement({ settlementId: id, ...body.data });
    return NextResponse.json({ movementId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

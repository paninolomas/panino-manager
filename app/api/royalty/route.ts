import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setRoyaltyRate } from "../../../lib/repositories/profitability.repo";
import { requireSocio } from "../../../lib/auth/session";

const schema = z.object({ percent: z.number().min(0).max(1) });

export async function POST(req: NextRequest) {
  await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const id = await setRoyaltyRate(body.data.percent);
    return NextResponse.json({ id }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

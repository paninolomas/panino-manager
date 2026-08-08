import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setReserveTarget } from "../../../lib/repositories/reserve.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({ amount: z.number().nonnegative() });

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const id = await setReserveTarget(body.data.amount);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

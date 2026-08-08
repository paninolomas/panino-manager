import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateAccount } from "../../../../lib/repositories/accounts.repo";
import { requireSession } from "../../../../lib/auth/session";

const schema = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const account = await updateAccount(id, body.data);
    return NextResponse.json(account, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

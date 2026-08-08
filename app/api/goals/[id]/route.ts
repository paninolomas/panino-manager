import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateGoal, deleteGoal } from "../../../../lib/repositories/goals.repo";
import { requireSocio } from "../../../../lib/auth/session";

const schema = z.object({
  targetValue: z.number().positive().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const goal = await updateGoal(id, body.data);
    return NextResponse.json(goal, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    await deleteGoal(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

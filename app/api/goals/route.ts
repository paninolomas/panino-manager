import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createGoal } from "../../../lib/repositories/goals.repo";
import { requireSocio } from "../../../lib/auth/session";

const schema = z.object({
  type: z.enum(["weekly", "monthly", "annual"]),
  variable: z.enum(["facturacion", "ganancia", "pedidos", "ticket_promedio", "margen", "caja", "ahorro"]),
  targetValue: z.number().positive(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export async function POST(req: NextRequest) {
  const profile = await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const goal = await createGoal({ ...body.data, locationId: profile.locationId, createdBy: profile.id });
    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

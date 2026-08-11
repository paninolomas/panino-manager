import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listSalesPeriods, createSalesPeriod } from "../../../lib/repositories/sales-periods.repo";
import { requireSocio } from "../../../lib/auth/session";

const schema = z.object({
  label: z.string().optional().nullable(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

export async function GET() {
  await requireSocio();
  try {
    const periods = await listSalesPeriods();
    return NextResponse.json(periods, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const id = await createSalesPeriod({ label: body.data.label ?? null, periodStart: body.data.periodStart, periodEnd: body.data.periodEnd });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

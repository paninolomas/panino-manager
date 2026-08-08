import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getSalesSummary,
  getCostByProduct,
  getCommissionByChannel,
  insertMarginSnapshots,
} from "../../../../lib/repositories/profitability.repo";
import { buildMarginSnapshots } from "../../../../lib/services/profitability-engine";
import { requireSocio } from "../../../../lib/auth/session";

const schema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
});

export async function POST(req: NextRequest) {
  await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const [summaries, costByProduct, commissionByChannel] = await Promise.all([
      getSalesSummary(body.data.periodStart, body.data.periodEnd),
      getCostByProduct(),
      getCommissionByChannel(),
    ]);

    if (summaries.length === 0) {
      return NextResponse.json(
        { error: "No hay ventas registradas en ese período para calcular rentabilidad." },
        { status: 400 }
      );
    }

    // El cálculo determinístico ocurre acá, server-side, con el motor puro --
    // la RPC de abajo solo persiste filas ya calculadas, nunca recalcula.
    const snapshots = buildMarginSnapshots({ summaries, costByProduct, commissionByChannel });

    const count = await insertMarginSnapshots({
      periodStart: body.data.periodStart,
      periodEnd: body.data.periodEnd,
      rows: snapshots,
    });

    return NextResponse.json({ count, snapshots }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

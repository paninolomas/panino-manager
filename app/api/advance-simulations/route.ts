import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { simulatePedidosYaAdvance, recommendAdvanceDecision } from "../../../lib/services/financial-engine";
import { recordAdvanceDecision } from "../../../lib/repositories/advance.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  settlementId: z.string().uuid().nullable(),
  netReceivable: z.number().positive(),
  normalPaymentDate: z.string(),
  advanceDate: z.string(),
  advanceFeePercent: z.number().min(0),
  vatPercent: z.number().min(0),
  projectedAvailableBeforeNormalDate: z.number(),
});

export async function POST(req: NextRequest) {
  await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  // El cálculo lo hace el motor determinístico acá, server-side -- el cliente
  // solo manda los parámetros de entrada, nunca el resultado. Así se cumple
  // la regla de que ningún costo financiero se confía sin recalcular.
  const simulation = simulatePedidosYaAdvance({
    netReceivable: body.data.netReceivable,
    normalPaymentDate: body.data.normalPaymentDate,
    advanceDate: body.data.advanceDate,
    advanceFeePercent: body.data.advanceFeePercent,
    vatPercent: body.data.vatPercent,
  });
  const recommendation = recommendAdvanceDecision({
    simulation,
    projectedAvailableBeforeNormalDate: body.data.projectedAvailableBeforeNormalDate,
  });

  try {
    const id = await recordAdvanceDecision({
      settlementId: body.data.settlementId,
      advanceFeePercent: body.data.advanceFeePercent,
      vatPercent: body.data.vatPercent,
      simulation,
      recommendation,
      projectedAvailableBeforeNormalDate: body.data.projectedAvailableBeforeNormalDate,
    });
    return NextResponse.json({ id, simulation, recommendation }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

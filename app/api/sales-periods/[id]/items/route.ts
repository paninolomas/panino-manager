import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveSalesPeriodItems } from "../../../../../lib/repositories/sales-periods.repo";
import { getProductProfitabilityInputs, getActiveRoyaltyRate } from "../../../../../lib/repositories/profitability.repo";
import { calculateProductProfitability } from "../../../../../lib/services/profitability-engine";
import { requireSocio } from "../../../../../lib/auth/session";

const schema = z.object({
  lines: z.array(z.object({ productId: z.string().uuid(), channelId: z.string().uuid(), quantity: z.number().min(0) })),
});

/**
 * Guarda cantidades para un período. El precio/costo/ganancia por unidad
 * que queda guardado (la "foto congelada") se calcula ACÁ, del lado del
 * servidor, a partir de los valores VIGENTES ahora mismo en
 * product_profitability_inputs -- nunca se confía en un precio/costo que
 * mande el cliente, mismo principio que el resto de la app (cálculos
 * financieros en el motor TS, nunca aceptados tal cual de afuera).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id: periodId } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const [profitabilityRows, royaltyPercent] = await Promise.all([getProductProfitabilityInputs(), getActiveRoyaltyRate()]);
    const byKey = new Map(profitabilityRows.map((r) => [`${r.productId}-${r.channelId}`, r]));

    const lines = body.data.lines
      .filter((l) => l.quantity > 0)
      .map((l) => {
        const row = byKey.get(`${l.productId}-${l.channelId}`);
        if (!row) return null; // producto sin precio cargado en ese canal -- no hay nada que fotografiar
        const result = calculateProductProfitability({
          price: row.price,
          cost: row.cost,
          commissionPercent: row.commissionPercent,
          royaltyPercent,
          onlinePaymentFeePercent: row.onlinePaymentFeePercent,
          discountPercent: row.discountPercent,
        });
        return {
          productId: l.productId,
          channelId: l.channelId,
          quantity: l.quantity,
          unitPrice: row.price,
          unitCost: row.cost,
          unitNetProfit: result.netObtained - row.cost,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    await saveSalesPeriodItems(periodId, lines);
    return NextResponse.json({ saved: lines.length }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

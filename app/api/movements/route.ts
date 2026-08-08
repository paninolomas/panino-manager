import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createManualMovement, transferBetweenAccounts } from "../../../lib/repositories/movements.repo";
import { requireSession } from "../../../lib/auth/session";

const manualSchema = z.object({
  kind: z.literal("manual"),
  accountId: z.string().uuid(),
  amount: z.number().positive(),
  direction: z.enum(["ingreso", "egreso"]),
  date: z.string(),
  description: z.string().min(1, "Todo movimiento manual requiere descripción"),
});

const transferSchema = z.object({
  kind: z.literal("transfer"),
  fromAccount: z.string().uuid(),
  toAccount: z.string().uuid(),
  amount: z.number().positive(),
  date: z.string(),
  description: z.string().min(1),
});

const schema = z.discriminatedUnion("kind", [manualSchema, transferSchema]);

export async function POST(req: NextRequest) {
  await requireSession();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.kind === "manual") {
      const id = await createManualMovement(parsed.data);
      return NextResponse.json({ id }, { status: 201 });
    }
    const id = await transferBetweenAccounts(parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAccount } from "../../../lib/repositories/accounts.repo";
import { requireSession } from "../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(["efectivo", "banco", "mercado_pago", "otra_billetera"]),
});

export async function POST(req: NextRequest) {
  const profile = await requireSession();
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const account = await createAccount({ ...body.data, locationId: profile.locationId });
    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    // RLS es la autoridad real: si el rol no tiene permiso de escritura, Supabase
    // devuelve un error acá aunque este código nunca lo haya validado explícitamente.
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

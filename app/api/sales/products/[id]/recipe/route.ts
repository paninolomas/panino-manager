import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProductRecipe, saveProductRecipe } from "../../../../../../lib/repositories/recipes.repo";
import { requireSocio } from "../../../../../../lib/auth/session";

const schema = z.object({
  lines: z.array(z.object({ stockItemId: z.string().uuid(), quantity: z.number().nonnegative() })),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSocio();
  const { id } = await params;
  try {
    const recipe = await getProductRecipe(id);
    return NextResponse.json(recipe, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireSocio();
  const { id } = await params;
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const cost = await saveProductRecipe(id, body.data.lines, profile.id);
    return NextResponse.json({ cost }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

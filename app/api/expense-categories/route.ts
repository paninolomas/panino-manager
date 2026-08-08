import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listExpenseCategories, createExpenseCategory } from "../../../lib/repositories/expenses.repo";
import { requireSocio } from "../../../lib/auth/session";

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(["variable", "fijo", "personal"]),
  parentId: z.string().uuid().optional(),
});

export async function GET() {
  await requireSocio();
  const categories = await listExpenseCategories();
  return NextResponse.json(categories, { status: 200 });
}

export async function POST(req: NextRequest) {
  await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  try {
    const category = await createExpenseCategory(body.data);
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

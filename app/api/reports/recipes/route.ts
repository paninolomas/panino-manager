import { NextResponse } from "next/server";
import { getAllRecipesForExport } from "../../../../lib/repositories/recipes.repo";
import { requireSocio } from "../../../../lib/auth/session";

export async function GET() {
  await requireSocio();
  try {
    const rows = await getAllRecipesForExport();
    return NextResponse.json(rows, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Papa from "papaparse";
import { requireSocio } from "../../../../lib/auth/session";

const schema = z.object({ csvText: z.string().min(1) });

export async function POST(req: NextRequest) {
  await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const parsed = Papa.parse<string[]>(body.data.csvText, { skipEmptyLines: true });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({ error: "No se pudo leer el archivo como CSV." }, { status: 400 });
  }

  const [headerRow, ...dataRows] = parsed.data;
  if (!headerRow || headerRow.length === 0) {
    return NextResponse.json({ error: "El archivo no tiene columnas reconocibles." }, { status: 400 });
  }

  return NextResponse.json({
    headers: headerRow,
    sampleRows: dataRows.slice(0, 5),
    totalRows: dataRows.length,
  });
}

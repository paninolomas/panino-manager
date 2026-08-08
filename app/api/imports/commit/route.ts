import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Papa from "papaparse";
import { requireSocio } from "../../../../lib/auth/session";
import { validateMappedRow, summarizeImportResults } from "../../../../lib/services/import-engine";
import { importOrder, createImportBatch, saveMappingTemplate } from "../../../../lib/repositories/imports.repo";
import type { ImportRowResult } from "../../../../types/domain";

const mappingSchema = z.object({
  date: z.string().min(1),
  time: z.string().optional(),
  externalOrderNumber: z.string().optional(),
  total: z.string().min(1),
  discount: z.string().optional(),
  paymentMethod: z.string().optional(),
});

const schema = z.object({
  channelId: z.string().uuid(),
  fileName: z.string(),
  csvText: z.string().min(1),
  mapping: mappingSchema,
  saveMappingAsTemplate: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const profile = await requireSocio();
  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { channelId, fileName, csvText, mapping, saveMappingAsTemplate } = body.data;

  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data;

  const results: ImportRowResult[] = [];
  const errorDetails: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowIndex = i + 1;
    const row = rows[i];

    const dateRaw = row[mapping.date] ?? "";
    const totalRaw = row[mapping.total] ?? "";
    const validated = validateMappedRow({ dateRaw, totalRaw });

    if (validated.status === "error") {
      results.push({ rowIndex, status: "error", message: validated.reason });
      errorDetails.push({ row: rowIndex, reason: validated.reason ?? "error desconocido" });
      continue;
    }

    const externalOrderNumber = mapping.externalOrderNumber ? row[mapping.externalOrderNumber] || null : null;
    const discountRaw = mapping.discount ? row[mapping.discount] : undefined;
    const paymentMethod = mapping.paymentMethod ? row[mapping.paymentMethod] : undefined;

    let warning: string | undefined;
    if (!externalOrderNumber) {
      warning = "Sin número de pedido -- no se puede detectar si se duplica en una futura importación.";
    }

    try {
      await importOrder({
        channelId,
        externalOrderNumber,
        orderDate: validated.date as string,
        total: validated.total as number,
        discount: discountRaw ? (validateMappedRow({ dateRaw: validated.date as string, totalRaw: discountRaw }).total ?? 0) : 0,
        paymentMethod,
      });
      results.push(warning ? { rowIndex, status: "warning", message: warning } : { rowIndex, status: "ok" });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("Pedido duplicado")) {
        results.push({ rowIndex, status: "duplicate", message });
      } else {
        results.push({ rowIndex, status: "error", message });
        errorDetails.push({ row: rowIndex, reason: message });
      }
    }
  }

  const summary = summarizeImportResults(results);

  await createImportBatch({
    locationId: profile.locationId,
    channelId,
    fileName,
    totalRows: summary.totalRows,
    okRows: summary.okRows,
    warningRows: summary.warningRows,
    errorRows: summary.errorRows,
    importedBy: profile.id,
  });

  if (saveMappingAsTemplate) {
    await saveMappingTemplate(channelId, mapping);
  }

  return NextResponse.json({ summary, errorDetails: errorDetails.slice(0, 50) });
}

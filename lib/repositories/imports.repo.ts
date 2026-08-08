import { createSupabaseServerClient } from "../supabase/server";
import type { ImportColumnMapping } from "../../types/domain";

export async function importOrder(input: {
  channelId: string;
  externalOrderNumber: string | null;
  orderDate: string;
  total: number;
  discount?: number;
  paymentMethod?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("import_order", {
    p_channel_id: input.channelId,
    p_external_order_number: input.externalOrderNumber,
    p_order_date: input.orderDate,
    p_total: input.total,
    p_discount: input.discount ?? 0,
    p_payment_method: input.paymentMethod,
  });
  if (error) throw error;
  return data as string;
}

export async function createImportBatch(input: {
  locationId: string;
  channelId: string;
  fileName: string;
  totalRows: number;
  okRows: number;
  warningRows: number;
  errorRows: number;
  importedBy: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      location_id: input.locationId,
      channel_id: input.channelId,
      file_name: input.fileName,
      total_rows: input.totalRows,
      ok_rows: input.okRows,
      warning_rows: input.warningRows,
      error_rows: input.errorRows,
      imported_by: input.importedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listImportBatches() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, channel_id, file_name, imported_at, total_rows, ok_rows, warning_rows, error_rows")
    .order("imported_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function getMappingTemplate(channelId: string): Promise<ImportColumnMapping | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("column_mapping_templates")
    .select("mapping")
    .eq("channel_id", channelId)
    .eq("name", "default")
    .maybeSingle();
  if (error) throw error;
  return (data?.mapping as ImportColumnMapping) ?? null;
}

export async function saveMappingTemplate(channelId: string, mapping: ImportColumnMapping) {
  const supabase = await createSupabaseServerClient();
  // Upsert manual: borra el "default" anterior de este canal y crea el nuevo
  // (más simple que depender de un unique constraint + upsert nativo acá,
  // y no hay riesgo de concurrencia real -- es una plantilla de configuración,
  // no un movimiento financiero).
  await supabase.from("column_mapping_templates").delete().eq("channel_id", channelId).eq("name", "default");
  const { data, error } = await supabase
    .from("column_mapping_templates")
    .insert({ channel_id: channelId, name: "default", mapping })
    .select()
    .single();
  if (error) throw error;
  return data;
}

import { createSupabaseServerClient } from "../supabase/server";

export async function listAuditLog(limit = 100) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, table_name, record_id, field, old_value, new_value, changed_by, changed_at")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

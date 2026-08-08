import { createSupabaseServerClient } from "../supabase/server";
import type { Obligation } from "../../types/domain";

export async function listSuppliers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, default_payment_terms_days, notes, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}

export async function updateSupplier(
  supplierId: string,
  input: { name?: string; defaultPaymentTermsDays?: number; notes?: string; active?: boolean }
) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.defaultPaymentTermsDays !== undefined) patch.default_payment_terms_days = input.defaultPaymentTermsDays;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.active !== undefined) patch.active = input.active;
  const { data, error } = await supabase.from("suppliers").update(patch).eq("id", supplierId).select().single();
  if (error) throw error;
  return data;
}

/**
 * Editar una obligación PENDIENTE (monto/fecha/vencimiento). Una vez pagada,
 * el trigger guard_obligation_immutability (0005) rechaza el UPDATE -- este
 * repo no duplica esa validación, deja que Postgres la haga (misma fuente
 * de verdad, un solo lugar donde puede romperse).
 */
export async function updateObligation(
  obligationId: string,
  input: { amount?: number; purchaseDate?: string; estimatedDueDate?: string }
) {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = {};
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.purchaseDate !== undefined) patch.purchase_date = input.purchaseDate;
  if (input.estimatedDueDate !== undefined) patch.estimated_due_date = input.estimatedDueDate;
  const { data, error } = await supabase.from("obligations").update(patch).eq("id", obligationId).select().single();
  if (error) throw error;
  return data;
}

export async function createSupplier(input: {
  name: string;
  locationId: string;
  defaultPaymentTermsDays?: number;
  notes?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name: input.name,
      location_id: input.locationId,
      default_payment_terms_days: input.defaultPaymentTermsDays ?? 0,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createObligation(input: {
  supplierId: string;
  amount: number;
  purchaseDate: string;
  estimatedDueDate: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("obligations")
    .insert({
      supplier_id: input.supplierId,
      amount: input.amount,
      purchase_date: input.purchaseDate,
      estimated_due_date: input.estimatedDueDate,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listObligations(): Promise<Obligation[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("obligations")
    .select("id, supplier_id, amount, estimated_due_date, status")
    .order("estimated_due_date");
  if (error) throw error;
  return (data ?? []).map((o) => ({
    id: o.id,
    supplierId: o.supplier_id,
    amount: Number(o.amount),
    estimatedDueDate: o.estimated_due_date,
    status: o.status,
  }));
}

export async function payObligation(input: {
  obligationId: string;
  accountId: string;
  date: string;
  description?: string;
}) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("pay_obligation", {
    p_obligation_id: input.obligationId,
    p_account_id: input.accountId,
    p_date: input.date,
    p_description: input.description,
  });
  if (error) throw error;
  return data;
}

import { createSupabaseServerClient } from "../supabase/server";
import type { Obligation } from "../../types/domain";

export async function listSuppliers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, default_payment_terms_days, notes")
    .order("name");
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

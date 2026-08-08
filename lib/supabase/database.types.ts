// Tipos de la base de datos.
//
// IMPORTANTE: esta versión está escrita a mano cubriendo las tablas que usa
// Fase 1. En cuanto el proyecto esté linkeado a un proyecto real de Supabase,
// reemplazar por el output de:
//
//   supabase gen types typescript --linked > lib/supabase/database.types.ts
//
// para que quede sincronizado automáticamente con el schema real (evita la
// deriva manual mencionada en la Sección E de la arquitectura).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string };
        Update: Partial<{ name: string }>;
      };
      profiles: {
        Row: {
          id: string;
          location_id: string;
          full_name: string;
          role: "socio" | "empleado";
          active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          location_id: string;
          full_name: string;
          role?: "socio" | "empleado";
        };
        Update: Partial<{ full_name: string; role: "socio" | "empleado"; active: boolean }>;
      };
      role_permissions: {
        Row: {
          id: string;
          role: "socio" | "empleado";
          module: string;
          can_read: boolean;
          can_write: boolean;
        };
        Insert: never;
        Update: never;
      };
      cash_accounts: {
        Row: {
          id: string;
          location_id: string;
          name: string;
          type: "efectivo" | "banco" | "mercado_pago" | "otra_billetera";
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          name: string;
          type: "efectivo" | "banco" | "mercado_pago" | "otra_billetera";
        };
        Update: Partial<{ name: string; active: boolean }>;
      };
      cash_movements: {
        Row: {
          id: string;
          account_id: string;
          amount: number;
          direction: "ingreso" | "egreso";
          date: string;
          origin_type: string;
          origin_id: string | null;
          transfer_group_id: string | null;
          description: string | null;
          created_by: string;
          created_at: string;
        };
        // No hay Insert directo: cash_movements se escribe únicamente vía RPC.
        Insert: never;
        Update: never;
      };
      suppliers: {
        Row: {
          id: string;
          location_id: string;
          name: string;
          default_payment_terms_days: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          name: string;
          default_payment_terms_days?: number;
          notes?: string | null;
        };
        Update: Partial<{ name: string; default_payment_terms_days: number; notes: string | null }>;
      };
      obligations: {
        Row: {
          id: string;
          supplier_id: string;
          amount: number;
          purchase_date: string;
          estimated_due_date: string;
          status: "pending" | "paid";
          paid_movement_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          supplier_id: string;
          amount: number;
          purchase_date: string;
          estimated_due_date: string;
        };
        Update: never; // status/paid_movement_id se actualiza vía RPC pay_obligation
      };
      expense_categories: {
        Row: { id: string; name: string; type: "variable" | "fijo" | "personal"; parent_id: string | null };
        Insert: never;
        Update: never;
      };
      expenses: {
        Row: {
          id: string;
          location_id: string;
          category_id: string;
          description: string;
          amount: number;
          date: string;
          status: "pending" | "paid";
          supplier_id: string | null;
          recurring_template_id: string | null;
          paid_movement_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          category_id: string;
          description: string;
          amount: number;
          date: string;
          supplier_id?: string | null;
        };
        Update: Partial<{ description: string; category_id: string }>; // amount/date bloqueados si status=paid (trigger DB)
      };
      recurring_expense_templates: {
        Row: {
          id: string;
          category_id: string;
          amount: number;
          day_of_month: number;
          frequency: "monthly";
          active: boolean;
        };
        Insert: { id?: string; category_id: string; amount: number; day_of_month: number };
        Update: Partial<{ amount: number; day_of_month: number; active: boolean }>;
      };
      channels: {
        Row: { id: string; name: string; settlement_model: "grouped" | "immediate" };
        Insert: never;
        Update: never;
      };
      products: {
        Row: {
          id: string;
          location_id: string;
          name: string;
          category: string | null;
          current_cost: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          name: string;
          category?: string | null;
          current_cost?: number;
        };
        Update: Partial<{ name: string; category: string | null; current_cost: number; active: boolean }>;
      };
      orders: {
        Row: {
          id: string;
          location_id: string;
          channel_id: string;
          settlement_id: string | null;
          commission_charge_id: string | null;
          external_order_number: string | null;
          order_datetime: string;
          subtotal: number;
          discount: number;
          total: number;
          payment_method: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: never; // se crea vía RPC record_sale
        Update: never;
      };
      order_items: {
        Row: { id: string; order_id: string; product_id: string; quantity: number; unit_price: number };
        Insert: never; // se crea vía RPC record_sale
        Update: never;
      };
      withdrawals: {
        Row: {
          id: string;
          partner_user_id: string;
          amount: number;
          date: string;
          approved_signal: "green" | "yellow" | "red";
          movement_id: string;
          created_at: string;
        };
        Insert: never; // se crea vía RPC record_withdrawal
        Update: never;
      };
      audit_log: {
        Row: {
          id: string;
          table_name: string;
          record_id: string;
          field: string;
          old_value: string | null;
          new_value: string | null;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: never;
        Update: never;
      };
      goals: {
        Row: {
          id: string;
          location_id: string;
          type: "weekly" | "monthly" | "annual";
          variable: "facturacion" | "ganancia" | "pedidos" | "ticket_promedio" | "margen" | "caja" | "ahorro";
          target_value: number;
          period_start: string;
          period_end: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          type: "weekly" | "monthly" | "annual";
          variable: "facturacion" | "ganancia" | "pedidos" | "ticket_promedio" | "margen" | "caja" | "ahorro";
          target_value: number;
          period_start: string;
          period_end: string;
          created_by: string;
        };
        Update: never;
      };
    };
    Functions: {
      create_opening_balance: {
        Args: {
          p_account_id: string;
          p_amount: number;
          p_direction: "ingreso" | "egreso";
          p_date: string;
          p_description?: string;
        };
        Returns: string;
      };
      pay_obligation: {
        Args: { p_obligation_id: string; p_account_id: string; p_date: string; p_description?: string };
        Returns: string;
      };
      pay_expense: {
        Args: { p_expense_id: string; p_account_id: string; p_date: string; p_description?: string };
        Returns: string;
      };
      transfer_between_accounts: {
        Args: {
          p_from_account: string;
          p_to_account: string;
          p_amount: number;
          p_date: string;
          p_description: string;
        };
        Returns: string;
      };
      create_manual_movement: {
        Args: {
          p_account_id: string;
          p_amount: number;
          p_direction: "ingreso" | "egreso";
          p_date: string;
          p_description: string;
        };
        Returns: string;
      };
      reverse_movement: {
        Args: { p_movement_id: string; p_description?: string };
        Returns: string;
      };
      record_withdrawal: {
        Args: {
          p_account_id: string;
          p_amount: number;
          p_date: string;
          p_signal: "green" | "yellow" | "red";
          p_description?: string;
        };
        Returns: string;
      };
      record_sale: {
        Args: {
          p_channel_id: string;
          p_external_order_number: string | null;
          p_items: Json;
          p_payment_method?: string;
        };
        Returns: string;
      };
      sales_products: {
        Args: Record<string, never>;
        Returns: { id: string; name: string; category: string | null; active: boolean }[];
      };
      generate_settlement: {
        Args: { p_channel_id: string; p_period_start: string; p_period_end: string };
        Returns: string;
      };
      collect_settlement: {
        Args: { p_settlement_id: string; p_account_id: string; p_date: string };
        Returns: string;
      };
      pay_commission: {
        Args: { p_commission_charge_id: string; p_account_id: string; p_date: string };
        Returns: string;
      };
      record_advance_decision: {
        Args: {
          p_settlement_id: string | null;
          p_net_receivable: number;
          p_normal_payment_date: string;
          p_advance_date: string;
          p_advance_fee_percent: number;
          p_vat_percent: number;
          p_advance_cost: number;
          p_net_if_advance: number;
          p_decision: string;
          p_reason: string;
          p_projected_available: number;
        };
        Returns: string;
      };
      set_reserve_target: {
        Args: { p_amount: number };
        Returns: string;
      };
      set_channel_price: {
        Args: { p_product_id: string; p_channel_id: string; p_price: number };
        Returns: string;
      };
      sales_summary_by_product_channel: {
        Args: { p_period_start: string; p_period_end: string };
        Returns: { product_id: string; channel_id: string; units_sold: number; gross_revenue: number }[];
      };
      insert_margin_snapshots: {
        Args: { p_period_start: string; p_period_end: string; p_rows: Json };
        Returns: number;
      };
      create_stock_movement: {
        Args: {
          p_stock_item_id: string;
          p_quantity: number;
          p_direction: "entrada" | "salida";
          p_date: string;
          p_origin_type: "purchase" | "consumption_manual" | "waste" | "adjustment";
          p_description?: string;
        };
        Returns: string;
      };
      reverse_stock_movement: {
        Args: { p_movement_id: string; p_description?: string };
        Returns: string;
      };
      daily_sales_series: {
        Args: { p_from: string; p_to: string };
        Returns: { date: string; revenue: number; orders_count: number }[];
      };
      import_order: {
        Args: {
          p_channel_id: string;
          p_external_order_number: string | null;
          p_order_date: string;
          p_total: number;
          p_discount?: number;
          p_payment_method?: string;
        };
        Returns: string;
      };
    };
  };
}

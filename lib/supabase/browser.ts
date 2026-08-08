import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para Client Components (formularios interactivos).
 * Ver nota en server.ts sobre por qué no se pasa el genérico Database<> todavía.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

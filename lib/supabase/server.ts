import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para usar en Server Components y Route Handlers.
 * Usa la cookie de sesión -- NUNCA la service role key (ver decisión de
 * Fase 1: todas las operaciones pasan por RLS con el usuario autenticado).
 *
 * Nota: no se pasa el genérico Database<> acá a propósito. lib/supabase/database.types.ts
 * está escrito a mano como stand-in (ver comentario en ese archivo) y todavía no
 * replica el shape exacto que @supabase/supabase-js espera para inferencia completa
 * (Views/Enums, Relationships, etc.). Forzarlo hoy degrada a `never` en las
 * respuestas en vez de dar tipado laxo -- preferible mantenerlo no tipado por ahora
 * y regenerar con `npm run types:generate` en cuanto el proyecto esté linkeado,
 * momento en el que se vuelve a agregar el genérico acá.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se llama desde un Server Component (no puede escribir cookies).
            // Es esperable -- el middleware/Route Handler ya se encarga de refrescar.
          }
        },
      },
    }
  );
}

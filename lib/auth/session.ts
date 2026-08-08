import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../supabase/server";

export interface SessionProfile {
  id: string;
  fullName: string;
  role: "socio" | "empleado";
  locationId: string;
}

/**
 * Devuelve el profile del usuario autenticado o null si no hay sesión.
 * Nota de seguridad: esto es una comodidad para la UI (mostrar/ocultar
 * secciones). La autorización real vive en las RLS policies -- si este
 * helper tuviera un bug, la base de datos igual protege el dato.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, location_id")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    fullName: profile.full_name,
    role: profile.role,
    locationId: profile.location_id,
  };
}

/** Usar en páginas que requieren sesión. Redirige a /login si no hay usuario. */
export async function requireSession(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Usar en páginas/route handlers exclusivos de socios (ej. /audit, /movements). */
export async function requireSocio(): Promise<SessionProfile> {
  const profile = await requireSession();
  if (profile.role !== "socio") {
    redirect("/dashboard?error=sin-permiso");
  }
  return profile;
}

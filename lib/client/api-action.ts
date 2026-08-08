"use client";

/** Mismo patrón que ya usan NewAccountForm/PayObligationButton/etc: fetch + devolver ok/error, el caller decide qué hacer (router.refresh(), limpiar estado, etc). No agrega abstracción nueva, solo evita repetir el boilerplate de fetch+json en cada botón de editar/desactivar/revertir. */
export async function apiAction(
  url: string,
  method: "PATCH" | "DELETE" | "POST",
  body?: unknown
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => null);
    return { ok: false, error: parsed?.error?.toString() ?? "No se pudo completar la acción." };
  }
  return { ok: true };
}

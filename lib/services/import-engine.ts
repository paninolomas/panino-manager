/**
 * Motor de importación — capa de servicios.
 *
 * Mismas reglas que el resto: funciones puras, sin Supabase, sin I/O (el
 * parseo del CSV en sí lo hace papaparse en el route handler; acá vive la
 * interpretación de cada valor -- fecha, número -- y la validación de fila).
 *
 * Decisión de arquitectura (Sección 23/28 del prompt original, "construir el
 * importador contra archivos reales de Panino, no inventar formatos"): como
 * no tenemos archivos reales todavía, el importador es GENÉRICO -- el
 * usuario mapea columnas manualmente en vez de asumir un layout fijo de
 * PedidosYa/Rappi/Pedix. `parseNumberFlexible` y `parseDateFlexible` cubren
 * los formatos más comunes (separador decimal argentino vs. internacional,
 * fecha DD/MM/AAAA vs. AAAA-MM-DD) sin asumir cuál va a aparecer.
 */

import type { ImportRowResult, ImportSummary } from "../../types/domain";

/**
 * Interpreta un número que puede venir en formato argentino (1.234,56) o
 * internacional (1234.56 o 1,234.56). Heurística:
 *  - si tiene coma Y punto: el símbolo que aparece último es el decimal.
 *  - si tiene solo coma: coma es decimal (formato argentino simple).
 *  - si tiene solo punto: punto es decimal (formato internacional simple).
 * Devuelve null si no se puede interpretar -- nunca un 0 disfrazado de dato real.
 */
export function parseNumberFlexible(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const cleaned = trimmed.replace(/[^\d.,-]/g, ""); // saca símbolos de moneda, espacios, etc.
  if (cleaned === "" || cleaned === "-") return null;

  const commaCount = (cleaned.match(/,/g) ?? []).length;
  const dotCount = (cleaned.match(/\./g) ?? []).length;

  let normalized: string;

  if (commaCount > 0 && dotCount > 0) {
    // Ambos símbolos presentes: el que aparece último es el separador decimal.
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".") // 1.234,56
        : cleaned.replace(/,/g, ""); // 1,234.56
  } else if (commaCount > 1) {
    // Varias comas sin puntos: son separadores de miles (1,234,567).
    normalized = cleaned.replace(/,/g, "");
  } else if (dotCount > 1) {
    // Varios puntos sin comas: son separadores de miles (1.234.567).
    normalized = cleaned.replace(/\./g, "");
  } else if (commaCount === 1) {
    // Una sola coma: decimal si tiene 1-2 dígitos después, miles si tiene
    // exactamente 3 (nadie factura con 3 decimales de centavos).
    const digitsAfter = cleaned.length - cleaned.indexOf(",") - 1;
    normalized = digitsAfter === 3 ? cleaned.replace(",", "") : cleaned.replace(",", ".");
  } else if (dotCount === 1) {
    // Mismo criterio con punto -- caso típico argentino "19.000" (miles).
    const digitsAfter = cleaned.length - cleaned.indexOf(".") - 1;
    normalized = digitsAfter === 3 ? cleaned.replace(".", "") : cleaned;
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Interpreta una fecha en varios formatos comunes y devuelve ISO (AAAA-MM-DD).
 * Soporta: AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA (prioriza día/mes/año, formato
 * argentino, sobre mes/día/año cuando el primer número es > 12).
 * Devuelve null si no se puede interpretar con confianza.
 */
export function parseDateFlexible(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return toIsoIfValid(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const slashOrDash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slashOrDash) {
    const a = Number(slashOrDash[1]);
    const b = Number(slashOrDash[2]);
    const year = Number(slashOrDash[3]);
    // Si el primer número no puede ser mes (>12), es inequívocamente DD/MM.
    // Si ambos son <= 12, asumimos DD/MM (convención argentina) -- ambigüedad
    // documentada, no resoluble sin saber el origen real del archivo.
    if (a > 12) return toIsoIfValid(year, b, a);
    return toIsoIfValid(year, b, a);
  }

  return null;
}

function toIsoIfValid(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Valida una fila ya mapeada (con los valores crudos de las columnas que el
 * usuario asignó). No bloquea el archivo completo -- cada fila se evalúa
 * independiente (Sección 23 del prompt original: "no bloquear la importación").
 */
export function validateMappedRow(params: {
  dateRaw: string;
  totalRaw: string;
}): { date: string | null; total: number | null; status: "ok" | "error"; reason?: string } {
  const date = parseDateFlexible(params.dateRaw);
  const total = parseNumberFlexible(params.totalRaw);

  if (date === null) return { date, total, status: "error", reason: `Fecha no reconocida: "${params.dateRaw}"` };
  if (total === null || total <= 0)
    return { date, total, status: "error", reason: `Monto inválido: "${params.totalRaw}"` };

  return { date, total, status: "ok" };
}

export function summarizeImportResults(results: ImportRowResult[]): ImportSummary {
  const totalRows = results.length;
  const okRows = results.filter((r) => r.status === "ok").length;
  const warningRows = results.filter((r) => r.status === "warning").length;
  const errorRows = results.filter((r) => r.status === "error").length;
  const duplicateRows = results.filter((r) => r.status === "duplicate").length;

  return {
    totalRows,
    okRows,
    warningRows,
    errorRows,
    duplicateRows,
    percentIdentified: totalRows > 0 ? (okRows + warningRows) / totalRows : 0,
  };
}

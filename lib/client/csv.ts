"use client";

/**
 * Descarga un array de filas como CSV. Usa PUNTO Y COMA como separador (no
 * coma) a propósito: en configuración regional Argentina, Excel usa la coma
 * como separador decimal, así que espera ";" para separar columnas -- un
 * CSV con comas se abre mal (todo en una sola columna) al doble-clickear
 * el archivo, que es como la mayoría de la gente lo va a abrir.
 *
 * BUG YA VIVIDO: separar columnas con ";" no alcanza -- los NÚMEROS
 * también tienen que ir con coma decimal, sino Excel-AR lee el "." de dentro
 * del número como separador de miles y arma un numerón absurdo (ej.
 * "1518.12" se leía como quince mil millones y pico). Por eso los valores
 * numéricos pasan por formatCsvNumber acá abajo, no se escriben tal cual
 * los da JS (que siempre usa punto).
 */
function formatCsvNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Sin separador de miles a propósito, solo coma decimal -- evita
  // cualquier ambigüedad con Excel y preserva la precisión completa (hay
  // cantidades de receta con 3 decimales, ej. 0.012 kg de sal fina, que un
  // redondeo a 2 decimales fijos destruiría).
  return String(n).replace(".", ",");
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const str = typeof value === "number" ? formatCsvNumber(value) : String(value ?? "");
    if (/[";\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(";"));
  // \ufeff (BOM) al principio: sin esto Excel interpreta los acentos/ñ como
  // caracteres raros al abrir el CSV directamente.
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

"use client";

/**
 * Descarga un array de filas como CSV. Usa PUNTO Y COMA como separador (no
 * coma) a propósito: en configuración regional Argentina, Excel usa la coma
 * como separador decimal, así que espera ";" para separar columnas -- un
 * CSV con comas se abre mal (todo en una sola columna) al doble-clickear
 * el archivo, que es como la mayoría de la gente lo va a abrir.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const str = String(value ?? "");
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

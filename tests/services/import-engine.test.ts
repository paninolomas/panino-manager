import { describe, it, expect } from "vitest";
import {
  parseNumberFlexible,
  parseDateFlexible,
  validateMappedRow,
  summarizeImportResults,
} from "../../lib/services/import-engine";
import type { ImportRowResult } from "../../types/domain";

describe("parseNumberFlexible", () => {
  it("interpreta formato argentino (punto de miles, coma decimal)", () => {
    expect(parseNumberFlexible("1.234,56")).toBeCloseTo(1234.56, 2);
  });
  it("interpreta formato internacional (coma de miles, punto decimal)", () => {
    expect(parseNumberFlexible("1,234.56")).toBeCloseTo(1234.56, 2);
  });
  it("interpreta solo coma como decimal", () => {
    expect(parseNumberFlexible("1234,56")).toBeCloseTo(1234.56, 2);
  });
  it("interpreta solo punto como decimal", () => {
    expect(parseNumberFlexible("1234.56")).toBeCloseTo(1234.56, 2);
  });
  it("ignora símbolos de moneda y espacios", () => {
    expect(parseNumberFlexible("$ 19.000")).toBeCloseTo(19000, 2);
  });
  it("devuelve null para texto no numérico -- nunca inventa un 0", () => {
    expect(parseNumberFlexible("no disponible")).toBeNull();
    expect(parseNumberFlexible("")).toBeNull();
  });
});

describe("parseDateFlexible", () => {
  it("interpreta ISO AAAA-MM-DD", () => {
    expect(parseDateFlexible("2026-08-14")).toBe("2026-08-14");
  });
  it("interpreta DD/MM/AAAA", () => {
    expect(parseDateFlexible("14/08/2026")).toBe("2026-08-14");
  });
  it("interpreta DD-MM-AAAA", () => {
    expect(parseDateFlexible("14-08-2026")).toBe("2026-08-14");
  });
  it("cuando el primer número no puede ser mes, lo resuelve sin ambigüedad", () => {
    expect(parseDateFlexible("25/12/2026")).toBe("2026-12-25");
  });
  it("devuelve null para texto no reconocible", () => {
    expect(parseDateFlexible("ayer")).toBeNull();
    expect(parseDateFlexible("")).toBeNull();
  });
  it("devuelve null para mes fuera de rango", () => {
    expect(parseDateFlexible("2026-13-01")).toBeNull();
  });
});

describe("validateMappedRow", () => {
  it("fila válida: fecha y monto reconocidos", () => {
    const result = validateMappedRow({ dateRaw: "14/08/2026", totalRaw: "19.000" });
    expect(result.status).toBe("ok");
    expect(result.date).toBe("2026-08-14");
    expect(result.total).toBe(19000);
  });

  it("fecha no reconocida -> error, con motivo explícito", () => {
    const result = validateMappedRow({ dateRaw: "fecha rara", totalRaw: "19000" });
    expect(result.status).toBe("error");
    expect(result.reason).toMatch(/Fecha no reconocida/);
  });

  it("monto 0 o negativo -> error (una venta no puede ser $0)", () => {
    const result = validateMappedRow({ dateRaw: "2026-08-14", totalRaw: "0" });
    expect(result.status).toBe("error");
  });
});

describe("summarizeImportResults", () => {
  it("cuenta cada estado y calcula el % identificado", () => {
    const results: ImportRowResult[] = [
      { rowIndex: 1, status: "ok" },
      { rowIndex: 2, status: "ok" },
      { rowIndex: 3, status: "warning", message: "sin número de pedido" },
      { rowIndex: 4, status: "error", message: "fecha inválida" },
      { rowIndex: 5, status: "duplicate" },
    ];
    const summary = summarizeImportResults(results);
    expect(summary.totalRows).toBe(5);
    expect(summary.okRows).toBe(2);
    expect(summary.warningRows).toBe(1);
    expect(summary.errorRows).toBe(1);
    expect(summary.duplicateRows).toBe(1);
    expect(summary.percentIdentified).toBeCloseTo(3 / 5, 4); // ok + warning
  });

  it("con 0 filas, percentIdentified es 0 (no divide por cero)", () => {
    expect(summarizeImportResults([]).percentIdentified).toBe(0);
  });

  it("nunca bloquea el archivo completo -- errores y éxitos conviven en el mismo resultado", () => {
    const results: ImportRowResult[] = [
      { rowIndex: 1, status: "ok" },
      { rowIndex: 2, status: "error", message: "monto inválido" },
    ];
    const summary = summarizeImportResults(results);
    expect(summary.okRows).toBe(1);
    expect(summary.errorRows).toBe(1);
  });
});

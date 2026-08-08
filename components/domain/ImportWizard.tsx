"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportColumnMapping } from "../../types/domain";

type Channel = { id: string; name: string };

const TARGET_FIELDS: { key: keyof ImportColumnMapping; label: string; required: boolean }[] = [
  { key: "date", label: "Fecha", required: true },
  { key: "time", label: "Hora (opcional)", required: false },
  { key: "externalOrderNumber", label: "N° de pedido (opcional, recomendado)", required: false },
  { key: "total", label: "Total", required: true },
  { key: "discount", label: "Descuento (opcional)", required: false },
  { key: "paymentMethod", label: "Medio de pago (opcional)", required: false },
];

type Step = "upload" | "map" | "result";

export function ImportWizard({
  channels,
  savedMappings,
}: {
  channels: Channel[];
  savedMappings: Record<string, ImportColumnMapping | null>;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<Partial<ImportColumnMapping>>({});
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    summary: { totalRows: number; okRows: number; warningRows: number; errorRows: number; duplicateRows: number; percentIdentified: number };
    errorDetails: { row: number; reason: string }[];
  } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvText(text);
    setError(null);
    setLoading(true);

    const res = await fetch("/api/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csvText: text }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.toString() ?? "No se pudo leer el archivo.");
      return;
    }
    setHeaders(body.headers);
    setSampleRows(body.sampleRows);
    setTotalRows(body.totalRows);
    setMapping(savedMappings[channelId] ?? {});
    setStep("map");
  }

  function updateMapping(field: keyof ImportColumnMapping, value: string) {
    setMapping((prev) => ({ ...prev, [field]: value || undefined }));
  }

  async function handleConfirm() {
    if (!mapping.date || !mapping.total) {
      setError("Fecha y Total son obligatorios.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/imports/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        fileName,
        csvText,
        mapping,
        saveMappingAsTemplate: saveTemplate,
      }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.toString() ?? "No se pudo importar.");
      return;
    }
    setResult(body);
    setStep("result");
    router.refresh();
  }

  function reset() {
    setStep("upload");
    setHeaders([]);
    setSampleRows([]);
    setMapping({});
    setResult(null);
    setFileName("");
    setCsvText("");
  }

  if (step === "upload") {
    return (
      <div className="stack">
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Canal</label>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Archivo CSV</label>
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
        </div>
        {loading && <p style={{ color: "var(--ink-soft)" }}>Leyendo archivo…</p>}
      </div>
    );
  }

  if (step === "map") {
    return (
      <div className="stack">
        {error && <div className="error-banner">{error}</div>}
        <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
          {totalRows} filas detectadas en {fileName}. Decile a cada columna del archivo qué campo
          representa.
        </p>

        <div className="stack">
          {TARGET_FIELDS.map((f) => (
            <div key={f.key} className="field">
              <label>
                {f.label}
                {f.required && " *"}
              </label>
              <select value={mapping[f.key] ?? ""} onChange={(e) => updateMapping(f.key, e.target.value)}>
                <option value="">-- sin mapear --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <div className="label">Vista previa</div>
          <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 4, borderBottom: "1px solid var(--line)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: 4, borderBottom: "1px dashed var(--line)" }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
          <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} />
          Guardar este mapeo para no repetirlo la próxima vez con este canal
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" type="button" onClick={reset}>
            Cancelar
          </button>
          <button className="btn" type="button" onClick={handleConfirm} disabled={loading}>
            {loading ? "Importando…" : "Confirmar importación"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "result" && result) {
    const { summary, errorDetails } = result;
    return (
      <div className="stack">
        <div className="card stack">
          <div className="row">
            <span className="label">Filas del archivo</span>
            <span className="figure">{summary.totalRows}</span>
          </div>
          <div className="row">
            <span style={{ color: "var(--positive)" }}>Importadas OK</span>
            <span className="figure">{summary.okRows}</span>
          </div>
          <div className="row">
            <span style={{ color: "var(--warning)" }}>Con advertencia (igual importadas)</span>
            <span className="figure">{summary.warningRows}</span>
          </div>
          <div className="row">
            <span style={{ color: "var(--risk)" }}>Con error (no importadas)</span>
            <span className="figure">{summary.errorRows}</span>
          </div>
          <div className="row">
            <span style={{ color: "var(--ink-soft)" }}>Duplicadas (ya existían)</span>
            <span className="figure">{summary.duplicateRows}</span>
          </div>
          <hr className="ticket-rule" />
          <div className="row">
            <span className="label">% identificado</span>
            <span className="value-lg">{(summary.percentIdentified * 100).toFixed(0)}%</span>
          </div>
        </div>

        {errorDetails.length > 0 && (
          <div className="card stack">
            <div className="label">Detalle de errores (primeros {errorDetails.length})</div>
            {errorDetails.map((e) => (
              <div key={e.row} className="row" style={{ fontSize: 13 }}>
                <span>Fila {e.row}</span>
                <span style={{ color: "var(--risk)" }}>{e.reason}</span>
              </div>
            ))}
          </div>
        )}

        <button className="btn" type="button" onClick={reset}>
          Importar otro archivo
        </button>
      </div>
    );
  }

  return null;
}

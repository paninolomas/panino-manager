import { listChannels } from "../../../lib/repositories/sales.repo";
import { listImportBatches, getMappingTemplate } from "../../../lib/repositories/imports.repo";
import { requireSocio } from "../../../lib/auth/session";
import { ImportWizard } from "../../../components/domain/ImportWizard";
import type { ImportColumnMapping } from "../../../types/domain";

export default async function ImportsPage() {
  await requireSocio();
  const [channels, batches] = await Promise.all([listChannels(), listImportBatches()]);

  const savedMappings: Record<string, ImportColumnMapping | null> = {};
  await Promise.all(
    channels.map(async (c) => {
      savedMappings[c.id] = await getMappingTemplate(c.id);
    })
  );

  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="stack">
      <h1>Importar ventas</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Importa a nivel de pedido (fecha, número, total) — todavía no importa el detalle de
        productos por línea. Construido contra un formato genérico porque no hay archivos reales
        de Panino disponibles; mapeá las columnas de tu export tal cual vienen.
      </p>

      <section className="card">
        <ImportWizard channels={channels} savedMappings={savedMappings} />
      </section>

      <section className="card stack">
        <div className="label">Importaciones recientes</div>
        {batches.length === 0 && <p style={{ color: "var(--ink-soft)" }}>Todavía no importaste ningún archivo.</p>}
        {batches.map((b) => (
          <div key={b.id} className="row">
            <span>
              {channelName(b.channel_id)} · {b.file_name}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {b.ok_rows} ok · {b.warning_rows} advertencia · {b.error_rows} error / {b.total_rows}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

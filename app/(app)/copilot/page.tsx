import { requireSocio } from "../../../lib/auth/session";
import { CopilotChat } from "../../../components/domain/CopilotChat";

export default async function CopilotPage() {
  await requireSocio();

  return (
    <div className="stack">
      <h1>Copiloto</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        Interpreta los datos reales de Panino Manager — nunca calcula por su cuenta. Si no hay
        suficiente información para responder algo, te lo dice en vez de inventar un número.
      </p>
      <CopilotChat />
    </div>
  );
}

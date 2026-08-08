import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireSocio } from "../../../lib/auth/session";
import { COPILOT_TOOLS, executeCopilotTool, type CopilotToolName } from "../../../lib/copilot/tools";

const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

const SYSTEM_PROMPT = `Sos el copiloto gerencial de Panino Manager, un local gastronómico (Panino).

Hablás con un socio del negocio. Tu trabajo es INTERPRETAR datos reales, nunca calcularlos vos.

Reglas estrictas, sin excepción:
1. Todo número que menciones tiene que venir literalmente de un resultado de una herramienta que llamaste EN ESTE TURNO. Nunca inventes, estimes de memoria, ni completes un dato faltante.
2. Si una herramienta no te da lo que necesitás para responder, decilo explícitamente ("no tengo ese dato disponible") en vez de aproximar.
3. Si un resultado trae "confidence: insuficiente" o un mensaje de "no hay historial suficiente", comunicá esa limitación tal cual -- no la suavices ni la ignores.
4. Para preguntas sobre plata (¿puedo pagar?, ¿cuánto puedo gastar?, ¿conviene adelantar?), siempre llamá a la herramienta correspondiente antes de responder, incluso si te parece obvio.
5. simulate_pedidosya_advance NUNCA debe asumir un porcentaje de costo del adelanto -- si el usuario no lo dio, preguntáselo antes de simular.
6. Sos un copiloto, no un ejecutor: nunca digas que "ya pagaste", "ya cobraste" o "ya adelantaste" algo -- vos solo interpretás y recomendás, las acciones reales las hace el socio desde la aplicación.
7. Respondé en español rioplatense, con el tono de alguien que conoce el negocio -- directo, sin relleno corporativo. Frases cortas. Si hay un problema, decilo arriba de todo.
8. Cuando dudás entre dos lecturas de una pregunta, elegí la interpretación financiera/operativa más natural para un local gastronómico chico, no la más genérica.`;

export async function POST(req: NextRequest) {
  await requireSocio();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "El Copiloto no está configurado todavía (falta ANTHROPIC_API_KEY en el servidor)." },
      { status: 503 }
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = body.data.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolsUsed: { name: string; input: unknown }[] = [];
  const MAX_TOOL_ITERATIONS = 6;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        tools: COPILOT_TOOLS as unknown as Anthropic.Tool[],
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return NextResponse.json({ reply: text, toolsUsed });
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const name = block.name as CopilotToolName;
        const input = block.input as Record<string, unknown>;
        toolsUsed.push({ name, input });

        const result = await executeCopilotTool(name, input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json(
      { error: "El Copiloto necesitó demasiados pasos para responder esto. Probá una pregunta más específica." },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

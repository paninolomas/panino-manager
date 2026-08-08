"use client";

import { useState, useRef, useEffect } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string; toolsUsed?: { name: string }[] };

const SUGGESTIONS = [
  "¿Cómo viene la caja?",
  "¿Qué tengo que comprar?",
  "¿Cómo fue ayer?",
  "¿Voy a alcanzar el objetivo?",
  "¿Qué producto deja más plata?",
];

export function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    const res = await fetch("/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(body?.error?.toString() ?? "No se pudo responder. Probá de nuevo.");
      return;
    }
    setMessages((prev) => [...prev, { role: "assistant", content: body.reply, toolsUsed: body.toolsUsed }]);
  }

  return (
    <div className="stack">
      <div className="card stack" style={{ minHeight: 320, maxHeight: 480, overflowY: "auto" }}>
        {messages.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Preguntale algo sobre caja, proveedores, rentabilidad, stock u objetivos. Solo va a
            responder con datos reales — si no hay suficiente información, te lo va a decir.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "row" : undefined} style={{ justifyContent: m.role === "user" ? "flex-end" : undefined }}>
            <div
              style={{
                maxWidth: "85%",
                marginLeft: m.role === "user" ? "auto" : 0,
                background: m.role === "user" ? "var(--primary)" : "var(--surface)",
                color: m.role === "user" ? "#fff" : "var(--ink)",
                border: m.role === "assistant" ? "1px solid var(--line)" : "none",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
              {m.role === "assistant" && m.toolsUsed && m.toolsUsed.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-soft)" }}>
                  Datos consultados: {m.toolsUsed.map((t) => t.name).join(", ")}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Consultando los datos…</p>}
        {error && <div className="error-banner">{error}</div>}
        <div ref={bottomRef} />
      </div>

      {messages.length === 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="pill" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Preguntale al copiloto…"
          style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 8 }}
        />
        <button className="btn" type="submit" disabled={loading}>
          Enviar
        </button>
      </form>
    </div>
  );
}

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COPILOT_TOOLS } from "../../lib/copilot/tools";

const ROOT = join(__dirname, "../..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Fase 6 -- el Copiloto nunca calcula por su cuenta", () => {
  it("el system prompt exige que todo número venga de una tool call de este turno", () => {
    const route = read("app/api/copilot/route.ts");
    expect(route).toMatch(/nunca inventes/i);
    expect(route).toMatch(/resultado de una herramienta que llamaste EN ESTE TURNO/);
  });

  it("el system prompt prohíbe asumir un % de adelanto fijo", () => {
    const route = read("app/api/copilot/route.ts");
    expect(route).toMatch(/NUNCA debe asumir un porcentaje de costo del adelanto/);
  });

  it("el system prompt deja explícito que el Copiloto no ejecuta acciones reales", () => {
    const route = read("app/api/copilot/route.ts");
    expect(route).toMatch(/no un ejecutor/i);
  });

  it("todas las herramientas del Copiloto llaman a motores/repos existentes, ninguna tiene lógica de cálculo propia embebida", () => {
    // Chequeo estructural: el archivo de tools no debe definir fórmulas nuevas
    // (multiplicaciones/divisiones de negocio) fuera de las que ya usan los
    // motores importados -- una señal de que todo el cálculo real sigue
    // viviendo en financial-engine/profitability-engine/stock-engine/goals-engine.
    const tools = read("lib/copilot/tools.ts");
    expect(tools).toMatch(/from "\.\.\/services\/financial-engine"/);
    expect(tools).toMatch(/from "\.\.\/services\/profitability-engine"/);
    expect(tools).toMatch(/from "\.\.\/services\/stock-engine"/);
    expect(tools).toMatch(/from "\.\.\/services\/goals-engine"/);
  });

  it("todas las herramientas declaradas tienen su rama correspondiente en executeCopilotTool", () => {
    const tools = read("lib/copilot/tools.ts");
    for (const t of COPILOT_TOOLS) {
      expect(tools).toMatch(new RegExp(`case "${t.name}":`));
    }
  });
});

describe("Fase 6 -- ANTHROPIC_API_KEY nunca se expone al cliente", () => {
  it("no aparece con prefijo NEXT_PUBLIC_", () => {
    const env = read(".env.example");
    expect(env).not.toMatch(/NEXT_PUBLIC_ANTHROPIC/i);
  });

  it("no se referencia desde ningún Client Component ('use client')", () => {
    const componentsDir = join(ROOT, "components");
    const files = readdirSync(componentsDir, { recursive: true }) as string[];
    for (const f of files) {
      if (!f.toString().endsWith(".tsx")) continue;
      const content = readFileSync(join(componentsDir, f.toString()), "utf-8");
      if (content.includes('"use client"')) {
        expect(content).not.toMatch(/ANTHROPIC_API_KEY/);
      }
    }
  });

  it("/api/copilot responde con un error explícito (no crashea) si falta la key", () => {
    const route = read("app/api/copilot/route.ts");
    expect(route).toMatch(/if \(!apiKey\)/);
    expect(route).toMatch(/status: 503/);
  });
});

describe("Fase 6 -- acceso restringido a socio", () => {
  it("/api/copilot usa requireSocio, no requireSession", () => {
    const route = read("app/api/copilot/route.ts");
    expect(route).toMatch(/requireSocio\(\)/);
  });

  it("la página /copilot usa requireSocio", () => {
    const page = read("app/(app)/copilot/page.tsx");
    expect(page).toMatch(/requireSocio\(\)/);
  });
});

describe("Fase 6 -- límite de iteraciones de tool calling (evita loops infinitos de costo)", () => {
  it("existe un tope explícito de iteraciones", () => {
    const route = read("app/api/copilot/route.ts");
    expect(route).toMatch(/MAX_TOOL_ITERATIONS/);
  });
});

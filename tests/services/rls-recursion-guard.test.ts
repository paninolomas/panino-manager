import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Bug real encontrado en producción (primera vez que las migraciones
 * corrieron contra un Postgres real): una policy de RLS sobre `profiles`
 * subconsultaba `profiles` directamente dentro de su propio USING, lo que
 * causa "ERROR 42P17: infinite recursion detected in policy". Corregido en
 * 0030 usando una función security definer (current_profile_role()) en vez
 * de una subconsulta directa.
 *
 * Este test generaliza esa lección: escanea TODAS las migraciones y falla
 * si encuentra una policy que subconsulte directamente la misma tabla sobre
 * la que está definida. No reemplaza correr contra un Postgres real (eso es
 * lo único que hubiera atrapado el bug original antes de producción), pero
 * evita que el mismo error se reintroduzca sin que nadie lo note.
 */

const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

function allMigrationsText(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8")).join("\n");
}

describe("RLS -- ninguna policy puede recursionar sobre su propia tabla", () => {
  it("no hay ninguna policy VIGENTE que haga FROM de la misma tabla sobre la que está definida", () => {
    const text = allMigrationsText();
    const policyRegex = /create policy "([^"]+)" on (\w+) for \w+/g;

    // Nos quedamos con la ÚLTIMA definición de cada (tabla, nombre) -- una
    // migración posterior puede legítimamente hacer DROP + CREATE de la
    // misma policy (ej. 0030 reemplaza la de 0010). Solo la versión vigente
    // importa para detectar recursión real.
    const lastBodyByKey = new Map<string, string>();

    let match: RegExpExecArray | null;
    while ((match = policyRegex.exec(text)) !== null) {
      const [, name, table] = match;
      const start = match.index + match[0].length;
      const end = text.indexOf(";", start);
      const block = text.slice(start, end);
      lastBodyByKey.set(`${table}::${name}`, block); // sobrescribe si ya existía -- queda la última
    }

    const offenders: string[] = [];
    for (const [key, block] of lastBodyByKey) {
      const table = key.split("::")[0];
      const selfReference = new RegExp(`from\\s+${table}\\b`, "i");
      if (selfReference.test(block)) offenders.push(key);
    }

    expect(offenders).toEqual([]);
  });

  it("current_profile_role() existe y es la forma correcta de chequear el rol dentro de una policy de profiles", () => {
    const text = allMigrationsText();
    expect(text).toMatch(/create or replace function current_profile_role\(\)/);
    expect(text).toMatch(/security definer/i);
  });
});

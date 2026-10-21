import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardarraíl de permisos: lo que CONFIGURA la instancia (número, llave de IA,
 * agente, conocimiento, agenda, etapas, plantillas, Laboratorio) solo lo
 * cambia quien `canConfigure`. Un `member` atiende la bandeja.
 *
 * Si este test se pone rojo porque agregaste un handler de escritura a una de
 * estas rutas: envuélvelo con `withConfigAuth`, o con un chequeo de rol
 * explícito si la ruta ya tiene el suyo.
 */

const API = path.resolve(import.meta.dirname, "..", "..", "src", "app", "api");

const RUTAS_DE_CONFIGURACION = [
  "settings/ai",
  "settings/ai/models",
  "settings/ai/test",
  "settings/capi",
  "settings/google",
  "settings/google/test",
  "settings/whatsapp",
  "settings/whatsapp/test",
  "settings/zoom",
  "settings/zoom/test",
  "agent/profile",
  "kb",
  "kb/[id]",
  "seed/demo",
  "templates",
  "templates/sync",
  "pipeline/stages",
  "pipeline/stages/[id]",
  "calendar/settings",
  "lab/runs",
  "lab/suggestions/apply",
  "turnos/agendas",
  "turnos/agendas/[id]",
];

describe("las rutas de configuración exigen rol", () => {
  it.each(RUTAS_DE_CONFIGURACION)("%s: ninguna escritura con withAuth a secas", (ruta) => {
    const code = readFileSync(path.join(API, ruta, "route.ts"), "utf8");
    expect(code).not.toMatch(/export const (POST|PUT|PATCH|DELETE) = withAuth\(/);
    expect(code).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)\b/);
  });
});

import { parseAgendaFlag } from "@/server/agenda/flag";

/**
 * 039 — Si esta instancia tiene turnos en vivo. Mismo patrón que `AGENDA`
 * (ADR-001): el código viaja siempre, la migración se aplica siempre, y la
 * bandera decide si la superficie existe. Apagada, todo responde 404.
 */
export function turnosEnabled(): boolean {
  return parseAgendaFlag(process.env.TURNOS);
}

export function turnosDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}

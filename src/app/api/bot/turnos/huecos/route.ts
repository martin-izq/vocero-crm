import { apiError } from "@/lib/api";
import { addDaysISO } from "@/lib/time/slots";
import { businessTimezone } from "@/server/analytics/period";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { contactoDeConversacion } from "@/server/turnos/http";
import { DIAS_DE_RESERVA, hoyEn, huecoPayload, huecosDeAgenda, listarAgendas } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 039 — Los horarios libres para reservar un turno con una agenda (la que
 * toma reservas). Con `date` (AAAA-MM-DD, zona del negocio), los de ese día;
 * sin ella, los de los próximos días hasta juntar unos cuantos. Lo que se
 * reserva tiene que salir de acá: el POST rechaza otro instante.
 */
export async function GET(req: Request) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const denied = requireBotKey(req);
  if (denied) return denied;
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "La instancia aún no tiene organización");

  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  const agendaId = url.searchParams.get("agendaId");
  const date = url.searchParams.get("date")?.trim() || null;
  if (!conversationId || !agendaId) return apiError(422, "invalid_body", "Faltan conversationId o agendaId");
  if (date && !ISO_DATE.test(date)) return apiError(422, "invalid_body", "date va como AAAA-MM-DD");
  if (!(await contactoDeConversacion(organizationId, conversationId))) {
    return apiError(404, "not_found", "Conversación no encontrada");
  }
  const agenda = (await listarAgendas(organizationId, { soloActivas: true })).find((a) => a.id === agendaId);
  if (!agenda) return apiError(404, "agenda_inexistente", "Esa agenda no existe.");
  if (agenda.walkInMode === "queue") {
    return apiError(409, "sin_reservas", `${agenda.name} atiende por orden de llegada: no toma reservas con horario.`);
  }

  const tz = await businessTimezone(organizationId);
  const hoy = hoyEn(tz);
  const dias = date ? [date] : Array.from({ length: DIAS_DE_RESERVA + 1 }, (_, i) => addDaysISO(hoy, i));
  const huecos: Date[] = [];
  for (const d of dias) {
    const delDia = await huecosDeAgenda(organizationId, agendaId, d);
    // Sin fecha: unas horas de cada día, para no mandar cien opciones.
    huecos.push(...(date ? delDia : delDia.filter((_, i) => i % Math.max(1, Math.floor(delDia.length / 3)) === 0).slice(0, 3)));
    if (!date && huecos.length >= 9) break;
  }
  return Response.json({
    agenda: { id: agenda.id, name: agenda.name, slotMinutes: agenda.slotMinutes, opensAt: agenda.opensAt, closesAt: agenda.closesAt },
    date,
    huecos: huecos.map((h) => huecoPayload(h, tz)),
  });
}

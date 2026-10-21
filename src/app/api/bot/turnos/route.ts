import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { altaBotSchema, contactoDeConversacion } from "@/server/turnos/http";
import { estadoParaContacto, sumarTurno } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/**
 * 039 — Turnos en vivo para el cerebro.
 *
 * GET: las agendas de hoy con su espera AHORA y los turnos activos de este
 * contacto (código, cuántos antes, hora estimada, link). Los números los
 * calcula el CRM: el cerebro los repite, no los inventa.
 *
 * POST: sumar al contacto a la fila de una agenda. 201 con código y link;
 * 409 tipados: `ya_tiene_turno` (con su turno), `sin_fila`, `cerrada`,
 * `sin_lugar`, `agenda_inexistente`, `ai_paused`, `sandbox_violation`.
 */
export async function GET(req: Request) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const denied = requireBotKey(req);
  if (denied) return denied;
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "La instancia aún no tiene organización");

  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return apiError(422, "invalid_body", "Falta conversationId");
  const conv = await contactoDeConversacion(organizationId, conversationId);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");
  return Response.json(await estadoParaContacto(organizationId, conv.contact.id));
}

export async function POST(req: Request) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const denied = requireBotKey(req);
  if (denied) return denied;
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "La instancia aún no tiene organización");

  const body = await parseBody(req, altaBotSchema);
  if (!body.ok) return body.response;
  const conv = await contactoDeConversacion(organizationId, body.data.conversationId);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");
  if (!conv.aiEnabled || conv.handoffAt) {
    return apiError(409, "ai_paused", "La IA está en pausa en esta conversación");
  }
  // Una conversación del Laboratorio jamás ocupa un lugar en la fila real.
  if (conv.isTest) {
    return apiError(409, "sandbox_violation", "Las conversaciones de prueba no toman turnos reales");
  }

  const r = await sumarTurno({
    organizationId,
    agendaId: body.data.agendaId,
    displayName: body.data.name || conv.contact.name,
    source: "whatsapp",
    actor: "agent",
    contactId: conv.contact.id,
    conversationId: body.data.conversationId,
  });
  if (!r.ok) {
    return Response.json(
      { error: { code: r.error, message: r.message } },
      { status: r.error === "agenda_inexistente" ? 404 : 409 }
    );
  }
  const estado = await estadoParaContacto(organizationId, conv.contact.id);
  const turno = estado.turnos.find((t) => t.id === r.turn.id);
  return Response.json({ turno, now: estado.now }, { status: 201 });
}

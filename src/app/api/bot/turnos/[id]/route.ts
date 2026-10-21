import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { accionBotSchema, contactoDeConversacion } from "@/server/turnos/http";
import { confirmarQueViene, transicionar, turnoDelContacto } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/**
 * 039 — El paciente cancela su turno de hoy o confirma que viene. Solo sobre
 * un turno de ESE contacto. 409 `no_cancelable` si ya lo llamaron o atendieron.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const denied = requireBotKey(req);
  if (denied) return denied;
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "La instancia aún no tiene organización");

  const { id } = await ctx.params;
  const body = await parseBody(req, accionBotSchema);
  if (!body.ok) return body.response;
  const conv = await contactoDeConversacion(organizationId, body.data.conversationId);
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");
  if (!conv.aiEnabled || conv.handoffAt) {
    return apiError(409, "ai_paused", "La IA está en pausa en esta conversación");
  }
  const turno = await turnoDelContacto(organizationId, conv.contact.id, id);
  if (!turno) return apiError(404, "not_found", "Turno no encontrado");

  if (body.data.action === "confirm") {
    await confirmarQueViene(organizationId, id);
    return Response.json({ ok: true, status: turno.status });
  }
  const r = await transicionar({ organizationId, turnId: id, expected: "waiting", to: "cancelled", actor: "client" });
  if (!r.ok) return apiError(409, "no_cancelable", r.message);
  return Response.json({ ok: true, status: "cancelled" });
}

import { apiError, parseBody, withConfigAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { agendaSchema } from "@/server/turnos/http";
import { guardarAgenda } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — Editar una agenda (o apagarla con `active: false`). */
export const PATCH = withConfigAuth(async (session, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { id } = await ctx.params;
  const body = await parseBody(req, agendaSchema);
  if (!body.ok) return body.response;
  const r = await guardarAgenda(session.organizationId, body.data, id);
  if (!r.ok) return apiError(r.message.startsWith("Ya hay") ? 409 : 404, "conflict", r.message);
  return Response.json({ agenda: r.agenda });
});

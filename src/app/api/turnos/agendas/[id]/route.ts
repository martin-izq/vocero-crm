import { apiError, parseBody, withConfigAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { agendaSchema } from "@/server/turnos/http";
import { borrarAgenda, guardarAgenda } from "@/server/turnos/service";

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

/** 039 — Borrar una agenda sin turnos pendientes (409 si los tiene). */
export const DELETE = withConfigAuth(async (session, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { id } = await ctx.params;
  const r = await borrarAgenda(session.organizationId, id);
  if (!r.ok) return apiError(r.error === "con_turnos" ? 409 : 404, r.error === "con_turnos" ? "conflict" : "not_found", r.message);
  return new Response(null, { status: 204 });
});

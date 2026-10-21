import { apiError, parseBody, withAuth, withConfigAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { agendaSchema } from "@/server/turnos/http";
import { guardarAgenda, listarAgendas } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — Las agendas de turnos. Leerlas, cualquiera; crearlas, quien configura. */
export const GET = withAuth(async (session) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  return Response.json({ agendas: await listarAgendas(session.organizationId) });
});

export const POST = withConfigAuth(async (session, req: Request) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const body = await parseBody(req, agendaSchema);
  if (!body.ok) return body.response;
  const r = await guardarAgenda(session.organizationId, body.data);
  if (!r.ok) return apiError(409, "conflict", r.message);
  return Response.json({ agenda: r.agenda }, { status: 201 });
});

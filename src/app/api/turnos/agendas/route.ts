import { apiError, parseBody, withAuth, withConfigAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { agendaSchema } from "@/server/turnos/http";
import { canConfigure } from "@/lib/auth/roles";
import {
  agendasDelOperario,
  alcanceDe,
  dentroDelAlcance,
  guardarAgenda,
  listarAgendas,
  operariosDelNegocio,
} from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/**
 * 039 — Las agendas de turnos. Leerlas, cualquiera; crearlas, quien
 * configura. A quien configura le llegan también los operarios y quién
 * atiende cada agenda (`operatorIds`).
 */
export const GET = withAuth(async (session) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const alcance = await alcanceDe(session);
  const agendas = (await listarAgendas(session.organizationId)).filter((a) => dentroDelAlcance(alcance, a.id));
  if (!canConfigure(session.role)) return Response.json({ agendas });
  const [operarios, asignadas] = await Promise.all([
    operariosDelNegocio(session.organizationId),
    agendasDelOperario(session.organizationId),
  ]);
  return Response.json({
    agendas: agendas.map((a) => ({
      ...a,
      operatorIds: Object.keys(asignadas).filter((u) => asignadas[u]!.includes(a.id)),
    })),
    operarios,
  });
});

export const POST = withConfigAuth(async (session, req: Request) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const body = await parseBody(req, agendaSchema);
  if (!body.ok) return body.response;
  const r = await guardarAgenda(session.organizationId, body.data);
  if (!r.ok) return apiError(409, "conflict", r.message);
  return Response.json({ agenda: r.agenda }, { status: 201 });
});

import { apiError, parseBody, withAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { altaRecepcionSchema } from "@/server/turnos/http";
import { alcanceDe, dentroDelAlcance, sumarTurno } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — «Agregar persona»: recepción suma a alguien sin turno a la fila. */
export const POST = withAuth(async (session, req: Request) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const body = await parseBody(req, altaRecepcionSchema);
  if (!body.ok) return body.response;
  if (!dentroDelAlcance(await alcanceDe(session), body.data.agendaId)) {
    return apiError(403, "forbidden", "Esa agenda no es tuya.");
  }
  const r = await sumarTurno({
    organizationId: session.organizationId,
    agendaId: body.data.agendaId,
    displayName: body.data.displayName,
    source: "reception",
    actor: "reception",
    userId: session.userId,
  });
  if (!r.ok) return apiError(409, r.error, r.message);
  return Response.json({ id: r.turn.id, code: r.code, link: r.link }, { status: 201 });
});

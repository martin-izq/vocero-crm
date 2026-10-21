import { withAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { tablero, vistaTablero } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — El día de todas las agendas, para recepción. */
export const GET = withAuth(async (session) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  return Response.json(vistaTablero(await tablero(session.organizationId)));
});

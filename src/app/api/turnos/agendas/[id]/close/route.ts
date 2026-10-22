import { apiError, withAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { alcanceDe, cerrarDia, dentroDelAlcance } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — «Cerrar agenda del día»: quien sigue esperando pasa a ausente. */
export const POST = withAuth(async (session, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { id } = await ctx.params;
  if (!dentroDelAlcance(await alcanceDe(session), id)) return apiError(403, "forbidden", "Esa agenda no es tuya.");
  return Response.json(await cerrarDia({ organizationId: session.organizationId, agendaId: id, userId: session.userId }));
});

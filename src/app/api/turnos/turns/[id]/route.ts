import { apiError, parseBody, withAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { transicionSchema } from "@/server/turnos/http";
import { transicionar } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/**
 * 039 — Llamar, comenzar, terminar, «no se presentó», cancelar. 409 `stale`
 * con el mensaje de quién accionó primero.
 */
export const POST = withAuth(async (session, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { id } = await ctx.params;
  const body = await parseBody(req, transicionSchema);
  if (!body.ok) return body.response;
  const r = await transicionar({
    organizationId: session.organizationId,
    turnId: id,
    expected: body.data.expected,
    to: body.data.to,
    actor: "reception",
    userId: session.userId,
  });
  if (!r.ok) return apiError(409, "stale", r.message);
  return Response.json({ ok: true });
});

import { z } from "zod";
import { apiError, parseBody, withConfigAuth } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { asignarOperarios } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

const schema = z.object({ userIds: z.array(z.string().min(1)).max(50) });

/** 039 — Quién atiende la agenda: reemplaza sus operarios (los de Equipo). */
export const PUT = withConfigAuth(async (session, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { id } = await ctx.params;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.response;
  if (!(await asignarOperarios(session.organizationId, id, body.data.userIds))) {
    return apiError(404, "not_found", "Esa agenda no existe.");
  }
  return new Response(null, { status: 204 });
});

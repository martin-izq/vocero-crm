import { apiError } from "@/lib/api";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { vistaPorToken } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — El estado del turno para su link (público: el token es la llave). */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { token } = await ctx.params;
  const vista = await vistaPorToken(token);
  if (!vista) return apiError(404, "not_found", "Este link ya no sirve");
  const { organizationId: _org, ...publica } = vista;
  return Response.json(publica, { headers: { "Cache-Control": "no-store" } });
}

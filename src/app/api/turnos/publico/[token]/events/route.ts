import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { vistaPorToken } from "@/server/turnos/service";
import { sseDeTurnos } from "@/server/turnos/sse";

export const dynamic = "force-dynamic";

/** 039 — Aviso «cambió algo» para el link del paciente; solo de SU agenda. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const { token } = await ctx.params;
  const vista = await vistaPorToken(token);
  if (!vista) return new Response("Este link ya no sirve", { status: 404 });
  return sseDeTurnos(req, vista.organizationId, vista.agendaId);
}

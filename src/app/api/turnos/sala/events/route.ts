import { resolveInstanceOrg } from "@/server/bot/auth";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { sseDeTurnos } from "@/server/turnos/sse";

export const dynamic = "force-dynamic";

/** 039 — Aviso «cambió algo» para la sala de espera. */
export async function GET(req: Request) {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return new Response(null, { status: 409 });
  return sseDeTurnos(req, organizationId, null);
}

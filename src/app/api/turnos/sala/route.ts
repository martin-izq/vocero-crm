import { apiError } from "@/lib/api";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { vistaSala } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/** 039 — La sala de espera (pública, para una TV): solo códigos, sin nombres. */
export async function GET() {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) return apiError(409, "no_org", "La instancia aún no tiene organización");
  return Response.json(await vistaSala(organizationId), { headers: { "Cache-Control": "no-store" } });
}

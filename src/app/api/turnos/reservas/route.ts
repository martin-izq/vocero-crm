import { apiError, withAuth } from "@/lib/api";
import { isIsoDate } from "@/lib/time/calendar";
import { addDaysISO } from "@/lib/time/slots";
import { businessTimezone } from "@/server/analytics/period";
import { turnosDisabledResponse, turnosEnabled } from "@/server/turnos/flag";
import { alcanceDe, DIAS_DE_AGENDA, hoyEn, reservas } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

/**
 * 039 — La pestaña «Agenda»: los turnos con horario de una semana
 * (`?desde=AAAA-MM-DD`, por defecto el lunes de esta semana). El operario ve
 * solo sus agendas.
 */
export const GET = withAuth(async (session, req: Request) => {
  if (!turnosEnabled()) return turnosDisabledResponse();
  const pedido = new URL(req.url).searchParams.get("desde");
  if (pedido !== null && !isIsoDate(pedido)) return apiError(422, "invalid_range", "desde: AAAA-MM-DD");
  let desde = pedido;
  if (!desde) {
    const hoy = hoyEn(await businessTimezone(session.organizationId));
    const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
    desde = addDaysISO(hoy, -((dow + 6) % 7));
  }
  return Response.json(await reservas(session.organizationId, desde, DIAS_DE_AGENDA, await alcanceDe(session)));
});

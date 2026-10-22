import { notFound, redirect } from "next/navigation";
import { TurnosClient } from "@/components/turnos/turnos-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { turnosEnabled } from "@/server/turnos/flag";

export const dynamic = "force-dynamic";

/**
 * 039 — Recepción: la fila del día («Hoy») y los turnos con horario de la
 * semana («Calendario»). Las agendas se configuran aparte, en /agendas. Sin
 * la bandera, esta pantalla no existe.
 */
export default async function TurnosPage() {
  if (!turnosEnabled()) notFound();
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  return <TurnosClient puedeConfigurar={canConfigure(session.role)} />;
}

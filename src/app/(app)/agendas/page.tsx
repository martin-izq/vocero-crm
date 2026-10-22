import { notFound, redirect } from "next/navigation";
import { AgendasAdmin } from "@/components/turnos/agendas-config";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { agendaEnabled } from "@/server/agenda/flag";
import { turnosEnabled } from "@/server/turnos/flag";

export const dynamic = "force-dynamic";

/** 039 — Configurar las agendas de Turnos: solo quien configura. */
export default async function AgendasPage() {
  if (!turnosEnabled()) notFound();
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canConfigure(session.role)) redirect("/turnos");
  return <AgendasAdmin citas={agendaEnabled()} />;
}

import { TeamClient } from "@/components/settings/team-client";
import { turnosEnabled } from "@/server/turnos/flag";

export const dynamic = "force-dynamic";

export default function TeamSettingsPage() {
  // 039 — El rol Operario solo existe con Turnos.
  return <TeamClient turnos={turnosEnabled()} />;
}

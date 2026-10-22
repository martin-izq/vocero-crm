import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SalaClient } from "@/components/turnos/sala-client";
import { resolveInstanceOrg } from "@/server/bot/auth";
import { getBranding } from "@/server/branding";
import { turnosEnabled } from "@/server/turnos/flag";
import { vistaSala } from "@/server/turnos/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sala de espera", robots: { index: false } };

/** 039 — Sala de espera (pública, para una TV). Sin nombres ni horarios. */
export default async function SalaPage() {
  if (!turnosEnabled()) notFound();
  const organizationId = await resolveInstanceOrg();
  if (!organizationId) notFound();
  const [inicial, branding] = await Promise.all([vistaSala(organizationId), getBranding(organizationId)]);
  return <SalaClient inicial={inicial} negocio={branding.name} />;
}

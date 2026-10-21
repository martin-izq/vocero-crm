import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TurnoEnVivo } from "@/components/turnos/turno-en-vivo";
import { turnosEnabled } from "@/server/turnos/flag";
import { vistaPorToken } from "@/server/turnos/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu turno", robots: { index: false } };

/** 039 — El link del paciente. Público: el token es la llave. */
export default async function TurnoPage({ params }: { params: Promise<{ token: string }> }) {
  if (!turnosEnabled()) notFound();
  const { token } = await params;
  const vista = await vistaPorToken(token);
  if (!vista) {
    return (
      <main className="mx-auto min-h-dvh max-w-md bg-background p-4">
        <h1 className="text-2xl font-bold">Este link ya no sirve</h1>
      </main>
    );
  }
  const { organizationId: _org, ...publica } = vista;
  return <TurnoEnVivo token={token} inicial={publica} />;
}

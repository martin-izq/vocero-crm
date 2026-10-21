"use client";

import { useCallback, useState } from "react";
import { roundToFive } from "@/lib/turnos/estimate";
import { duracion, horaLocal } from "@/lib/turnos/format";
import type { VistaPaciente } from "@/server/turnos/service";
import { useCambios } from "./use-cambios";

type Vista = Omit<VistaPaciente, "organizationId">;

/** 039 — El link del paciente: cuánto falta, en vivo. */
export function TurnoEnVivo({ token, inicial }: { token: string; inicial: Vista }) {
  const [v, setV] = useState<Vista | null>(inicial);
  const refrescar = useCallback(async () => {
    const res = await fetch(`/api/turnos/publico/${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    if (res?.status === 404) setV(null);
    else if (res?.ok) setV((await res.json()) as Vista);
  }, [token]);
  useCambios(`/api/turnos/publico/${encodeURIComponent(token)}/events`, () => void refrescar());

  if (!v) return <Marco><h1 className="text-2xl font-bold">Este link ya no sirve</h1></Marco>;
  const hora = (iso: string) => horaLocal(new Date(iso), v.timezone);

  if (v.status === "called") {
    return (
      <main role="alert" className="flex min-h-dvh flex-col justify-center bg-primary p-6 text-primary-foreground">
        <p className="text-2xl font-bold">{v.code}</p>
        <h1 className="mt-2 text-5xl font-extrabold">Es tu turno</h1>
        <p className="mt-4 text-3xl font-extrabold">{v.room || "Acercate a recepción"}</p>
      </main>
    );
  }

  return (
    <Marco negocio={v.negocio} agenda={v.agenda}>
      {v.status === "waiting" && v.estimatedAt && (
        <div aria-live="polite">
          {v.delayMinutes >= 5 && (
            <p role="status" className="mb-4 rounded-lg border border-warning-soft bg-warning-tint p-3 font-bold text-warning-text">
              Viene con {duracion(v.delayMinutes)} de demora
            </p>
          )}
          <p className="text-sm text-muted-foreground">Tu número</p>
          <p className="text-4xl font-extrabold" data-testid="codigo">{v.code}</p>
          <p className="mt-6 text-6xl font-extrabold leading-none" data-testid="antes">{v.peopleBefore}</p>
          <p className="text-xl font-bold">{v.peopleBefore === 1 ? "persona antes que vos" : "personas antes que vos"}</p>
          <p className="mt-6 text-lg">
            {v.scheduledAt ? `Tu cita: ${hora(v.scheduledAt)} · ` : ""}Te atienden cerca de las{" "}
            <span className="font-extrabold">{horaLocal(roundToFive(new Date(v.estimatedAt)), v.timezone)}</span>
          </p>
          <p className="text-muted-foreground">
            Espera estimada: {duracion((new Date(v.estimatedAt).getTime() - new Date(v.updatedAt).getTime()) / 60_000)}
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            {v.servingCode ? `Atendiendo ahora al ${v.servingCode} · ` : ""}Actualizado {hora(v.updatedAt)}
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Te avisamos por WhatsApp cuando falte poco. Para cancelar, respondé en el chat.
          </p>
        </div>
      )}
      {v.status === "in_service" && <h1 className="text-3xl font-extrabold text-success-text">Te están atendiendo</h1>}
      {v.status === "finished" && <h1 className="text-3xl font-extrabold">Listo, ya te atendieron</h1>}
      {v.status === "cancelled" && <h1 className="text-3xl font-extrabold">Tu turno se canceló</h1>}
      {v.status === "absent" && <h1 className="text-3xl font-extrabold">Tu turno quedó como ausente</h1>}
    </Marco>
  );
}

function Marco({ negocio, agenda, children }: { negocio?: string; agenda?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-md bg-background p-4">
      {negocio && (
        <header className="mb-4">
          <p className="text-sm text-muted-foreground">{negocio}</p>
          <p className="font-semibold">{agenda}</p>
        </header>
      )}
      <section className="rounded-2xl border bg-card p-5">{children}</section>
    </main>
  );
}

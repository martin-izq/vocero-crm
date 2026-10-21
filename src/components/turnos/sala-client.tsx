"use client";

import { useCallback, useState } from "react";
import type { vistaSala } from "@/server/turnos/service";
import { useCambios } from "./use-cambios";

type Sala = Awaited<ReturnType<typeof vistaSala>>;

/** 039 — La sala de espera (TV): quién pasa y quién sigue. Solo códigos. */
export function SalaClient({ inicial }: { inicial: Sala }) {
  const [sala, setSala] = useState(inicial);
  const refrescar = useCallback(async () => {
    const res = await fetch("/api/turnos/sala", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSala((await res.json()) as Sala);
  }, []);
  useCambios("/api/turnos/sala/events", () => void refrescar());

  return (
    <main className="min-h-dvh bg-background p-6">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sala.agendas.map((a) => (
          <section key={a.id} className="rounded-2xl border bg-card p-6" data-agenda={a.name}>
            <h2 className="text-2xl font-bold">{a.name}</h2>
            <p className="text-muted-foreground">{a.room}</p>
            <div className="mt-6" aria-live="polite">
              <p className="text-sm uppercase tracking-wide text-muted-foreground">Pasa</p>
              <p className="text-6xl font-extrabold text-primary" data-testid="llamado">
                {a.llamado.join(" · ") || a.atendiendo.join(" · ") || "—"}
              </p>
            </div>
            <p className="mt-6 text-sm uppercase tracking-wide text-muted-foreground">Siguen</p>
            <p className="text-2xl font-semibold">{a.siguientes.join("  ") || "—"}</p>
          </section>
        ))}
      </div>
    </main>
  );
}

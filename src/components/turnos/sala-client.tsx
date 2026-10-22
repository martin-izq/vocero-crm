"use client";

import { useCallback, useEffect, useState } from "react";
import { fechaLocal, horaLocal } from "@/lib/turnos/format";
import { cn } from "@/lib/utils";
import type { vistaSala } from "@/server/turnos/service";
import { colorDeAgenda } from "./color";
import { useCambios } from "./use-cambios";

type Sala = Awaited<ReturnType<typeof vistaSala>>;

/**
 * 039 — La sala de espera (TV): quién pasa, a dónde, y quién sigue. Solo
 * números, nunca nombres. Siempre en tema oscuro: en una TV se lee mejor y
 * no encandila la sala. El número recién llamado destella unos segundos.
 */
export function SalaClient({ inicial, negocio }: { inicial: Sala; negocio: string }) {
  const [sala, setSala] = useState(inicial);
  const [ahora, setAhora] = useState(() => new Date());
  const refrescar = useCallback(async () => {
    const res = await fetch("/api/turnos/sala", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSala((await res.json()) as Sala);
  }, []);
  useCambios("/api/turnos/sala/events", () => void refrescar());

  useEffect(() => {
    const html = document.documentElement;
    const antes = html.dataset.theme;
    html.dataset.theme = "dark";
    const t = setInterval(() => setAhora(new Date()), 10_000);
    return () => {
      clearInterval(t);
      if (antes) html.dataset.theme = antes;
    };
  }, []);

  const tz = sala.timezone;
  // Solo las agendas con gente hoy; el índice original mantiene su color.
  const conTurnos = sala.agendas
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.llamado.length + a.atendiendo.length + a.siguientes.length > 0);
  const pocas = conTurnos.length <= 2;

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-6 border-b px-8 py-5">
        <p className="truncate text-2xl font-bold tracking-tight">{negocio}</p>
        <div className="text-right">
          <p className="font-mono text-4xl font-bold tabular-nums">{horaLocal(ahora, tz)}</p>
          <p className="text-sm capitalize text-text-3">{fechaLocal(ahora, tz)}</p>
        </div>
      </header>

      <div
        className="grid flex-1 content-start gap-6 p-8"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${pocas ? "26rem" : "20rem"}, 1fr))` }}
      >
        {conTurnos.length === 0 && (
          <p className="col-span-full py-24 text-center text-3xl text-text-3">Todavía no hay turnos.</p>
        )}
        {conTurnos.map(({ a, i }) => {
          const pasa = a.llamado[0] ?? null;
          return (
            <section
              key={`${a.id}:${pasa ?? ""}`}
              data-agenda={a.name}
              className={cn(
                "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-md",
                pasa && "sala-llamado"
              )}
            >
              <div className="h-2" style={{ background: colorDeAgenda(i) }} />
              <div className="flex flex-1 flex-col gap-6 p-7">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">{a.name}</h2>
                  {(a.specialty || a.room) && (
                    <p className="mt-1 text-lg text-text-3">{[a.specialty, a.room].filter(Boolean).join(" · ")}</p>
                  )}
                </div>

                <div aria-live="assertive">
                  <p className="kicker !text-[13px]">{pasa ? "Pasa" : a.atendiendo.length ? "Atendiendo" : "Llamado"}</p>
                  <p
                    data-testid="llamado"
                    className={cn(
                      "mt-1 font-mono font-extrabold leading-none tracking-tight",
                      pasa ? "text-brand-text" : "text-text-2",
                      pocas ? "text-[clamp(4.5rem,10vw,9rem)]" : "text-[clamp(3.5rem,7vw,6.5rem)]"
                    )}
                  >
                    {a.llamado.join(" · ") || a.atendiendo.join(" · ")}
                  </p>
                  {!pasa && a.atendiendo.length === 0 && <p className="mt-2 text-2xl text-text-3">Todavía no llamamos a nadie</p>}
                  {pasa && <p className="mt-3 text-2xl font-semibold">{a.room ? `Pase a ${a.room}` : "Acérquese a recepción"}</p>}
                </div>

                <div className="mt-auto">
                  <p className="kicker !text-[13px]">Siguen</p>
                  {a.siguientes.length === 0 ? (
                    <p className="mt-2 text-xl text-text-3">Nadie en espera</p>
                  ) : (
                    <ol className="mt-2 flex flex-wrap gap-2">
                      {a.siguientes.map((c, j) => (
                        <li
                          key={c}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 font-mono text-2xl font-semibold tabular-nums",
                            j === 0 ? "border-border-strong bg-chip text-foreground" : "text-text-2"
                          )}
                        >
                          {c}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <footer className="border-t px-8 py-4 text-center text-lg text-text-3">
        Seguí tu turno por WhatsApp: te avisamos cuando falte poco y cuando sea tu turno.
      </footer>
    </main>
  );
}

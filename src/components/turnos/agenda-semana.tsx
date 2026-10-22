"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEvents } from "@/components/use-events";
import { fechaLocal, horaLocal } from "@/lib/turnos/format";
import { addDaysISO } from "@/lib/time/slots";
import type { VistaReservas } from "@/server/turnos/service";

/**
 * 039 — Pestaña «Agenda»: los turnos con horario de la semana, un color por
 * agenda y filtro por agenda. El operario recibe solo las suyas del servidor.
 */

const PASADO: Record<string, string> = {
  called: "Llamado",
  in_service: "Atendiendo",
  finished: "Atendido",
  absent: "Ausente",
};

/** Un tono por agenda, estable por su posición; sirve en claro y oscuro. */
function color(i: number): string {
  return `hsl(${(i * 67 + 215) % 360} 70% 50%)`;
}

export function AgendaSemana() {
  const [desde, setDesde] = useState<string | null>(null);
  const [data, setData] = useState<VistaReservas | null>(null);
  const [filtro, setFiltro] = useState("todas");

  const refetch = useCallback(async () => {
    const res = await fetch(`/api/turnos/reservas${desde ? `?desde=${desde}` : ""}`, { cache: "no-store" }).catch(
      () => null
    );
    if (res?.ok) setData((await res.json()) as VistaReservas);
  }, [desde]);

  useEffect(() => void refetch(), [refetch]);
  useEvents({ onTurnoChanged: () => void refetch(), onReconnect: () => void refetch() });

  async function cancelar(id: string, quien: string) {
    if (!confirm(`¿Cancelar el turno de ${quien}? No se le avisa por WhatsApp.`)) return;
    await fetch(`/api/turnos/turns/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected: "waiting", to: "cancelled" }),
    }).catch(() => null);
    void refetch();
  }

  if (!data) return null;
  const indice = new Map(data.agendas.map((a, i) => [a.id, i]));
  const nombre = new Map(data.agendas.map((a) => [a.id, a.name]));
  const dias = Array.from({ length: data.dias }, (_, i) => addDaysISO(data.desde, i));
  const visibles = data.turns.filter((t) => filtro === "todas" || t.agendaId === filtro);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" aria-label="Semana anterior" onClick={() => setDesde(addDaysISO(data.desde, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDesde(null)}>
          Esta semana
        </Button>
        <Button size="sm" variant="outline" aria-label="Semana siguiente" onClick={() => setDesde(addDaysISO(data.desde, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <select
          aria-label="Agenda"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        >
          <option value="todas">Todas las agendas</option>
          {data.agendas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {data.agendas.map((a, i) => (
            <span key={a.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color(i) }} />
              {a.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {dias.map((d) => {
          const delDia = visibles.filter((t) => t.day === d);
          return (
            <Card key={d} className={`min-w-0 p-2 ${d === data.hoy ? "ring-2 ring-primary" : ""}`} data-dia={d}>
              <p className="mb-2 text-xs font-semibold capitalize">
                {fechaLocal(new Date(`${d}T12:00:00Z`), "UTC")}
                {d === data.hoy && " · hoy"}
              </p>
              {delDia.length === 0 && <p className="text-xs text-muted-foreground">Sin turnos</p>}
              <ul className="space-y-1.5">
                {delDia.map((t) => (
                  <li
                    key={t.id}
                    data-turno={t.code}
                    className="rounded border border-l-4 px-2 py-1 text-xs"
                    style={{ borderLeftColor: color(indice.get(t.agendaId) ?? 0) }}
                    title={nombre.get(t.agendaId)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono font-semibold">{horaLocal(new Date(t.scheduledAt), data.timezone)}</span>
                      <span className="font-mono text-muted-foreground">{t.code}</span>
                    </div>
                    <p className="truncate">{t.displayName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {t.source === "booking" && <Badge variant="outline">Cita</Badge>}
                      {PASADO[t.status] && <Badge variant="secondary">{PASADO[t.status]}</Badge>}
                      {t.status === "waiting" && d >= data.hoy && (
                        <button
                          type="button"
                          className="text-muted-foreground underline"
                          onClick={() => void cancelar(t.id, t.displayName)}
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

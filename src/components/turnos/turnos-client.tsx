"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MonitorPlay, Plus, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEvents } from "@/components/use-events";
import { duracion, horaLocal } from "@/lib/turnos/format";
import type { MainAction } from "@/lib/turnos/reception";
import type { TurnStatus } from "@/lib/turnos/transitions";
import type { VistaTablero } from "@/server/turnos/service";
import { AgendaSemana } from "./agenda-semana";
import { AgendasConfig } from "./agendas-config";

/**
 * 039 — Recepción: la fila del día de cada agenda. Se refresca sola con el
 * SSE (`turno.changed`) y, si el canal se cae, cada 20 s.
 */

type Agenda = VistaTablero["agendas"][number];
type Turno = Agenda["turns"][number];

const ESTADO: Record<TurnStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  waiting: { label: "En espera", variant: "secondary" },
  called: { label: "Llamado", variant: "warning" },
  in_service: { label: "Atendiendo", variant: "default" },
  finished: { label: "Atendido", variant: "success" },
  cancelled: { label: "Canceló", variant: "outline" },
  absent: { label: "Ausente", variant: "outline" },
};

export function TurnosClient({
  puedeConfigurar,
  citas = false,
}: {
  puedeConfigurar: boolean;
  /** ¿Está la agenda de Citas de Vocero? Sin ella, «Recibe las citas» no aplica. */
  citas?: boolean;
}) {
  const [vista, setVista] = useState<"hoy" | "agenda">("hoy");
  const [data, setData] = useState<VistaTablero | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [config, setConfig] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/turnos/board", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData((await res.json()) as VistaTablero);
  }, []);

  useEffect(() => {
    void refetch();
    const t = setInterval(() => void refetch(), 20_000);
    return () => clearInterval(t);
  }, [refetch]);

  useEvents({ onTurnoChanged: () => void refetch(), onReconnect: () => void refetch() });

  async function accionar(turnId: string, expected: TurnStatus, to: TurnStatus) {
    const res = await fetch(`/api/turnos/turns/${turnId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected, to }),
    }).catch(() => null);
    if (res && res.status === 409) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setAviso(body?.error?.message ?? "Otro lo cambió primero.");
    }
    return res?.ok ?? false;
  }

  async function principal(p: MainAction) {
    setAviso(null);
    for (const s of p.steps) {
      if (!(await accionar(s.turnId, s.expected, s.to))) break;
    }
    void refetch();
  }

  async function cerrar(agendaId: string) {
    if (!confirm("¿Cerrar la agenda del día? Quienes siguen esperando quedan como ausentes.")) return;
    await fetch(`/api/turnos/agendas/${agendaId}/close`, { method: "POST" }).catch(() => null);
    void refetch();
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[17px] font-bold tracking-tight">Turnos</h2>
          <div role="tablist" className="flex rounded-md border p-0.5 text-sm">
            {(["hoy", "agenda"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={`rounded px-3 py-1 ${vista === v ? "bg-muted font-semibold" : "text-muted-foreground"}`}
              >
                {v === "hoy" ? "Hoy" : "Agenda"}
              </button>
            ))}
          </div>
          {data && vista === "hoy" && <span className="text-sm text-muted-foreground">{data.day}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/sala" target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">
              <MonitorPlay className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
              Sala de espera
            </Button>
          </a>
          {puedeConfigurar && (
            <Button size="sm" variant="outline" onClick={() => setConfig((v) => !v)}>
              <Settings2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
              Agendas
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {aviso && (
          <p role="status" className="rounded-md border border-warning-soft bg-warning-tint px-3 py-2 text-sm text-warning-text">
            {aviso}
          </p>
        )}
        {config && puedeConfigurar && <AgendasConfig citas={citas} onSaved={() => void refetch()} />}
        {vista === "agenda" && <AgendaSemana />}
        {vista === "hoy" && data && data.agendas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay agendas.{" "}
            {puedeConfigurar ? "Creá la primera desde «Agendas»." : "Pedile al dueño que cree una o que te asigne la tuya."}
          </p>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          {vista === "hoy" && data?.agendas.map((a) => (
            <AgendaCard
              key={a.id}
              agenda={a}
              timezone={data.timezone}
              onPrincipal={principal}
              onAccion={async (id, e, t) => {
                setAviso(null);
                await accionar(id, e, t);
                void refetch();
              }}
              onCerrar={() => void cerrar(a.id)}
              onAgregado={() => void refetch()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgendaCard({
  agenda,
  timezone,
  onPrincipal,
  onAccion,
  onCerrar,
  onAgregado,
}: {
  agenda: Agenda;
  timezone: string;
  onPrincipal: (p: MainAction) => void;
  onAccion: (turnId: string, expected: TurnStatus, to: TurnStatus) => void;
  onCerrar: () => void;
  onAgregado: () => void;
}) {
  const activos = agenda.turns.filter((t) => ["waiting", "called", "in_service"].includes(t.status));
  const hechos = agenda.turns.filter((t) => !["waiting", "called", "in_service"].includes(t.status));
  return (
    <Card className="p-4" data-agenda={agenda.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{agenda.name}</h3>
          <p className="text-xs text-muted-foreground">
            {agenda.room || "Sin consultorio"} · {agenda.opensAt}–{agenda.closesAt} · promedio{" "}
            {duracion(agenda.averageMinutes)}
          </p>
        </div>
        {agenda.delayMinutes >= 5 ? (
          <Badge variant="warning">{duracion(agenda.delayMinutes)} de demora</Badge>
        ) : (
          <Badge variant="success">En horario</Badge>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {agenda.principal && (
          <Button size="sm" onClick={() => onPrincipal(agenda.principal!)}>
            {agenda.principal.label}
          </Button>
        )}
        <Agregar agendaId={agenda.id} disabled={agenda.walkInMode === "none"} onAgregado={onAgregado} />
        <Button size="sm" variant="ghost" onClick={onCerrar}>
          Cerrar agenda del día
        </Button>
      </div>

      <ul className="mt-3 divide-y">
        {activos.length === 0 && <li className="py-2 text-sm text-muted-foreground">Nadie en la fila.</li>}
        {activos.map((t) => (
          <Fila key={t.id} t={t} timezone={timezone} onAccion={onAccion} />
        ))}
      </ul>
      {hechos.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Ya pasaron ({hechos.length})</summary>
          <ul className="mt-1 divide-y opacity-70">
            {hechos.map((t) => (
              <Fila key={t.id} t={t} timezone={timezone} onAccion={onAccion} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Fila({
  t,
  timezone,
  onAccion,
}: {
  t: Turno;
  timezone: string;
  onAccion: (turnId: string, expected: TurnStatus, to: TurnStatus) => void;
}) {
  const est = ESTADO[t.status];
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-turno={t.code}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{t.code}</span>
          <span className="truncate text-sm">{t.displayName}</span>
          <Badge variant={est.variant}>{est.label}</Badge>
          {t.confirmedAt && t.status === "waiting" && <Badge variant="success">Confirmó</Badge>}
          {t.noticeFailed && <Badge variant="destructive">Sin aviso</Badge>}
          {t.whatsapp && <span className="text-xs text-muted-foreground">WhatsApp</span>}
        </div>
        <p className="text-xs text-muted-foreground">
          {t.scheduledAt
            ? `${t.source === "booking" ? "Cita" : "Turno"} ${horaLocal(new Date(t.scheduledAt), timezone)}`
            : "Por orden de llegada"}
          {t.status === "waiting" && t.estimatedAt
            ? ` · ≈ ${horaLocal(new Date(t.estimatedAt), timezone)} · ${t.peopleBefore} antes`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {t.status === "waiting" && (
          <>
            <Button size="sm" variant="outline" onClick={() => onAccion(t.id, "waiting", "called")}>
              Llamar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAccion(t.id, "waiting", "cancelled")}>
              Cancelar
            </Button>
          </>
        )}
        {t.status === "called" && (
          <>
            <Button size="sm" variant="outline" onClick={() => onAccion(t.id, "called", "in_service")}>
              Comenzar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAccion(t.id, "called", "waiting")}>
              No se presentó
            </Button>
          </>
        )}
        {t.status === "in_service" && (
          <Button size="sm" variant="outline" onClick={() => onAccion(t.id, "in_service", "finished")}>
            Terminar
          </Button>
        )}
      </div>
    </li>
  );
}

function Agregar({ agendaId, disabled, onAgregado }: { agendaId: string; disabled: boolean; onAgregado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [hecho, setHecho] = useState<{ code: string; link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sumar() {
    setError(null);
    const res = await fetch("/api/turnos/turns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agendaId, displayName: nombre }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | { code?: string; link?: string; error?: { message?: string } }
      | null;
    if (!res?.ok || !body?.code || !body.link) {
      setError(body?.error?.message ?? "No se pudo agregar.");
      return;
    }
    setHecho({ code: body.code, link: body.link });
    setNombre("");
    onAgregado();
  }

  if (disabled) return null;
  if (!abierto) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setAbierto(true)}>
        <Plus className="mr-1 h-4 w-4" strokeWidth={1.8} />
        Agregar persona
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border p-2">
      <Input
        aria-label="Nombre"
        placeholder="Nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && nombre.trim() && void sumar()}
        className="h-8 max-w-[220px]"
      />
      <Button size="sm" disabled={!nombre.trim()} onClick={() => void sumar()}>
        Sumar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { setAbierto(false); setHecho(null); }}>
        Listo
      </Button>
      {error && <span className="text-sm text-danger-text">{error}</span>}
      {hecho && (
        <span className="flex flex-wrap items-center gap-2 text-sm">
          Turno <strong className="font-mono">{hecho.code}</strong>
          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(hecho.link)}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar link
          </Button>
          <a
            className="underline"
            href={`https://wa.me/?text=${encodeURIComponent(`Tu turno ${hecho.code}: ${hecho.link}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            Mandar por WhatsApp
          </a>
        </span>
      )}
    </div>
  );
}

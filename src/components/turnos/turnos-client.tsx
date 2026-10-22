"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MessageCircle, MonitorPlay, Plus, Settings2, UserX, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEvents } from "@/components/use-events";
import { rangeLabel } from "@/lib/time/calendar";
import { falta } from "@/lib/turnos/calendario";
import { duracion, horaLocal } from "@/lib/turnos/format";
import type { MainAction } from "@/lib/turnos/reception";
import type { TurnStatus } from "@/lib/turnos/transitions";
import { cn } from "@/lib/utils";
import type { VistaTablero } from "@/server/turnos/service";
import { AgendaCalendario, FiltroEspecialidad } from "./agenda-calendario";
import { AgendasConfig } from "./agendas-config";
import { colorDeAgenda } from "./color";

/**
 * 039 — Recepción: «Hoy» (la fila del día de cada agenda) y «Agenda» (la
 * rejilla de horas). Se refresca sola con el SSE (`turno.changed`) y, si el
 * canal se cae, cada 20 s.
 */

type Agenda = VistaTablero["agendas"][number];
type Turno = Agenda["turns"][number];
type Accion = (turnId: string, expected: TurnStatus, to: TurnStatus) => void;

const ACTIVOS: TurnStatus[] = ["waiting", "called", "in_service"];

const PASADO: Partial<Record<TurnStatus, { label: string; variant: "success" | "outline" }>> = {
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
  const [especialidad, setEspecialidad] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const refetch = useCallback(async () => {
    const res = await fetch("/api/turnos/board", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData((await res.json()) as VistaTablero);
  }, []);

  useEffect(() => {
    void refetch();
    const t = setInterval(() => void refetch(), 20_000);
    const r = setInterval(() => setAhora(Date.now()), 30_000);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
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

  const especialidades = [...new Set(data?.agendas.map((a) => a.specialty).filter(Boolean) ?? [])].sort();
  // El índice original mantiene el color de cada agenda con el filtro puesto.
  const visibles = (data?.agendas ?? [])
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !especialidad || a.specialty === especialidad);
  const todos = visibles.flatMap(({ a }) => a.turns);
  const cuenta = (s: TurnStatus[]) => todos.filter((t) => s.includes(t.status)).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[17px] font-bold tracking-tight">Turnos</h2>
          <div role="tablist" className="flex rounded-md border bg-subtle p-0.5 text-sm">
            {(["hoy", "agenda"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={cn(
                  "rounded px-3 py-1 transition-colors",
                  vista === v ? "bg-card font-semibold text-foreground shadow-sm" : "text-text-3 hover:text-foreground"
                )}
              >
                {v === "hoy" ? "Hoy" : "Agenda"}
              </button>
            ))}
          </div>
          {data && vista === "hoy" && (
            <span className="text-sm text-text-3">{rangeLabel("dia", data.day)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/sala" target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">
              <MonitorPlay className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
              Sala de espera
            </Button>
          </a>
          {puedeConfigurar && (
            <Button size="sm" variant={config ? "default" : "outline"} onClick={() => setConfig((v) => !v)}>
              <Settings2 className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
              Agendas
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        {aviso && (
          <p role="status" className="rounded-md border border-warning-soft bg-warning-tint px-3 py-2 text-sm text-warning-text">
            {aviso}
          </p>
        )}
        {config && puedeConfigurar && <AgendasConfig citas={citas} onSaved={() => void refetch()} />}

        {vista === "agenda" && <AgendaCalendario />}

        {vista === "hoy" && data && data.agendas.length === 0 && (
          <Card className="p-8 text-center text-sm text-text-3">
            Todavía no hay agendas.{" "}
            {puedeConfigurar ? "Creá la primera desde «Agendas»." : "Pedile al dueño que cree una o que te asigne la tuya."}
          </Card>
        )}

        {vista === "hoy" && data && data.agendas.length > 0 && (
          <>
            {especialidades.length > 1 && (
              <FiltroEspecialidad opciones={especialidades} valor={especialidad} onChange={setEspecialidad} />
            )}
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              <Dato label="En espera" valor={cuenta(["waiting"])} />
              <Dato label="En consultorio" valor={cuenta(["called", "in_service"])} />
              <Dato label="Atendidos" valor={cuenta(["finished"])} />
              <Dato label="Ausentes" valor={cuenta(["absent"])} />
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {visibles.map(({ a, i }) => (
                <AgendaCard
                  key={a.id}
                  agenda={a}
                  color={colorDeAgenda(i)}
                  timezone={data.timezone}
                  ahora={ahora}
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
          </>
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: number }) {
  return (
    <Card className="px-3 py-2 sm:px-4 sm:py-3">
      <p className="kicker truncate !text-[9.5px] sm:!text-[10.5px]">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">{valor}</p>
    </Card>
  );
}

function AgendaCard({
  agenda,
  color,
  timezone,
  ahora,
  onPrincipal,
  onAccion,
  onCerrar,
  onAgregado,
}: {
  agenda: Agenda;
  color: string;
  timezone: string;
  ahora: number;
  onPrincipal: (p: MainAction) => void;
  onAccion: Accion;
  onCerrar: () => void;
  onAgregado: () => void;
}) {
  const enConsultorio = agenda.turns.filter((t) => t.status === "called" || t.status === "in_service");
  const esperando = agenda.turns.filter((t) => t.status === "waiting");
  const hechos = agenda.turns.filter((t) => !ACTIVOS.includes(t.status));
  const proximo = esperando[0]?.estimatedAt;

  return (
    <Card className="overflow-hidden" data-agenda={agenda.name}>
      <div className="h-1" style={{ background: color }} />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-bold">{agenda.name}</h3>
            <p className="text-xs text-text-3">
              {agenda.specialty && `${agenda.specialty} · `}
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

        {/* Quién está pasando: lo primero que mira recepción. */}
        <div className="rounded-lg border bg-subtle p-3">
          <p className="kicker">En consultorio</p>
          {enConsultorio.length === 0 ? (
            <p className="mt-1 text-sm text-text-3">Nadie todavía.</p>
          ) : (
            enConsultorio.map((t) => (
              <div key={t.id} className="mt-1.5 flex flex-wrap items-center justify-between gap-2" data-turno={t.code}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-2xl font-bold tracking-tight">{t.code}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.displayName}</p>
                    <p className={cn("text-xs", t.status === "called" ? "text-warning-text" : "text-success-text")}>
                      {t.status === "called" ? "Llamado" : "Atendiendo"}
                      {t.statusChangedAt && ` ${falta(Date.parse(t.statusChangedAt) - ahora)}`}
                    </p>
                  </div>
                </div>
                {/* Comenzar y terminar los hace el botón grande; aquí, lo que no. */}
                {t.status === "called" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="No se presentó: vuelve a la fila"
                    onClick={() => onAccion(t.id, "called", "waiting")}
                  >
                    <UserX className="mr-1 h-4 w-4" /> No vino
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {agenda.principal && (
          <Button className="h-11 w-full text-[15px]" onClick={() => onPrincipal(agenda.principal!)}>
            {agenda.principal.label}
          </Button>
        )}

        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="kicker">En espera · {esperando.length}</p>
            {proximo && (
              <p className="text-xs text-text-3">
                Próximo ≈ {horaLocal(new Date(proximo), timezone)} ({falta(Date.parse(proximo) - ahora)})
              </p>
            )}
          </div>
          {esperando.length === 0 ? (
            <p className="rounded-md border border-dashed py-4 text-center text-sm text-text-3">Nadie en la fila.</p>
          ) : (
            <ol className="divide-y rounded-md border">
              {esperando.map((t, i) => (
                <Fila key={t.id} t={t} posicion={i + 1} timezone={timezone} ahora={ahora} onAccion={onAccion} />
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Agregar agendaId={agenda.id} disabled={agenda.walkInMode === "none"} onAgregado={onAgregado} />
          <Button size="sm" variant="ghost" className="ml-auto text-text-3" onClick={onCerrar}>
            Cerrar el día
          </Button>
        </div>

        {hechos.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-3">Ya pasaron ({hechos.length})</summary>
            <ul className="mt-2 divide-y rounded-md border">
              {hechos.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2" data-turno={t.code}>
                  <span className="w-12 shrink-0 font-mono text-sm font-semibold">{t.code}</span>
                  <span className="min-w-0 flex-1 truncate">{t.displayName}</span>
                  {PASADO[t.status] && <Badge variant={PASADO[t.status]!.variant}>{PASADO[t.status]!.label}</Badge>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function Fila({
  t,
  posicion,
  timezone,
  ahora,
  onAccion,
}: {
  t: Turno;
  posicion: number;
  timezone: string;
  ahora: number;
  onAccion: Accion;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2" data-turno={t.code}>
      <div className="w-16 shrink-0 text-right">
        <p className="font-mono text-sm font-semibold tabular-nums">
          {t.estimatedAt ? `≈${horaLocal(new Date(t.estimatedAt), timezone)}` : "—"}
        </p>
        <p className="text-[11px] text-text-3">
          {t.estimatedAt ? falta(Date.parse(t.estimatedAt) - ahora) : `#${posicion}`}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm font-semibold">{t.code}</span>
          <span className="truncate text-sm">{t.displayName}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-3">
          <span>
            {t.scheduledAt
              ? `${t.source === "booking" ? "Cita" : "Turno"} ${horaLocal(new Date(t.scheduledAt), timezone)}`
              : "Por orden de llegada"}
          </span>
          {t.whatsapp && (
            <span className="flex items-center gap-0.5">
              · <MessageCircle className="h-3 w-3" /> WhatsApp
            </span>
          )}
          {t.confirmedAt && <Badge variant="success">Confirmó</Badge>}
          {t.noticeFailed && <Badge variant="destructive">Sin aviso</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => onAccion(t.id, "waiting", "called")}>
          Llamar
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Cancelar ${t.code}`}
          title="Cancelar turno"
          onClick={() => onAccion(t.id, "waiting", "cancelled")}
        >
          <X className="h-4 w-4" />
        </Button>
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
    <div className="flex w-full flex-wrap items-center gap-2 rounded-md border bg-subtle p-2">
      <Input
        aria-label="Nombre"
        placeholder="Nombre"
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && nombre.trim() && void sumar()}
        className="h-8 max-w-[220px] bg-card"
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

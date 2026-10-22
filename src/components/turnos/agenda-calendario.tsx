"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEvents } from "@/components/use-events";
import { addDaysISO } from "@/lib/time/slots";
import { dayHeading, hhmm, layoutOverlaps, rangeLabel, startOfWeek, wallClock } from "@/lib/time/calendar";
import { aMinutos, falta, franjaVisible, huecosDelDia, type Franja } from "@/lib/turnos/calendario";
import { cn } from "@/lib/utils";
import type { VistaReservas } from "@/server/turnos/service";
import { colorDeAgenda } from "./color";

/**
 * 039 — Pestaña «Agenda»: la rejilla de horas de Turnos, como Google Calendar.
 *
 * - Semana: una columna por día; Día: una columna por agenda (cada médico con
 *   su horario sombreado y sus huecos libres).
 * - Cada turno ocupa lo que dura; el de la fila sin horario se dibuja a su
 *   hora estimada, punteado. Una línea marca ahora y cada turno de hoy dice
 *   cuánto falta.
 * - El operario recibe del servidor solo sus agendas.
 */

type Vista = "dia" | "semana";
type Turno = VistaReservas["turns"][number];
type Agenda = VistaReservas["agendas"][number];
type Ubicado = Franja & { turno: Turno; col: number; cols: number };

/** Alto de una hora: con 80 px, un turno de 15 minutos todavía entra en una línea. */
const HORA_PX = 80;

const ESTADO: Partial<Record<Turno["status"], string>> = {
  called: "Llamado",
  in_service: "Atendiendo",
  finished: "Atendido",
  absent: "Ausente",
};

export function AgendaCalendario() {
  const [vista, setVista] = useState<Vista>("semana");
  const [ancla, setAncla] = useState<string | null>(null);
  const [data, setData] = useState<VistaReservas | null>(null);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [especialidad, setEspecialidad] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  // En el celular, una semana de siete columnas no se lee: arranca en Día.
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setVista("dia");
  }, []);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const semana = ancla ? startOfWeek(ancla) : null;
  const refetch = useCallback(async () => {
    const res = await fetch(`/api/turnos/reservas${semana ? `?desde=${semana}` : ""}`, { cache: "no-store" }).catch(
      () => null
    );
    if (!res?.ok) return;
    const d = (await res.json()) as VistaReservas;
    setData(d);
    setAncla((a) => a ?? d.hoy);
  }, [semana]);

  useEffect(() => void refetch(), [refetch]);
  useEvents({ onTurnoChanged: () => void refetch(), onReconnect: () => void refetch() });

  const tz = data?.timezone ?? "UTC";
  const ubicados = useMemo(() => {
    const out = new Map<string, (Franja & { turno: Turno })[]>();
    for (const t of data?.turns ?? []) {
      const { day, minutes } = wallClock(t.startAt, tz);
      const f = { startMin: minutes, endMin: Math.min(1440, minutes + t.minutes), turno: t };
      out.set(day, [...(out.get(day) ?? []), f]);
    }
    return out;
  }, [data, tz]);

  if (!data || !ancla) return <p className="text-sm text-muted-foreground">Cargando la agenda…</p>;

  const especialidades = [...new Set(data.agendas.map((a) => a.specialty).filter(Boolean))].sort();
  const delFiltro = data.agendas.filter((a) => !especialidad || a.specialty === especialidad);
  const visibles = delFiltro.filter((a) => !ocultas.has(a.id));
  const idsVisibles = new Set(visibles.map((a) => a.id));
  const delDia = (day: string, agendaId?: string) =>
    (ubicados.get(day) ?? []).filter((u) =>
      agendaId ? u.turno.agendaId === agendaId : idsVisibles.has(u.turno.agendaId)
    );
  const dias = vista === "semana" ? Array.from({ length: 7 }, (_, i) => addDaysISO(startOfWeek(ancla), i)) : [ancla];
  const franja = franjaVisible(
    visibles,
    dias.flatMap((d) => delDia(d))
  );
  const reloj = wallClock(new Date(ahora), tz);
  const indice = new Map(data.agendas.map((a, i) => [a.id, i]));
  const sel = data.turns.find((t) => t.id === elegido) ?? null;

  const columnas: { key: string; day: string; agenda: Agenda | null }[] =
    vista === "semana"
      ? dias.map((d) => ({ key: d, day: d, agenda: null }))
      : visibles.map((a) => ({ key: a.id, day: ancla, agenda: a }));

  function mover(n: number) {
    setAncla((a) => addDaysISO(a!, vista === "semana" ? 7 * n : n));
    setElegido(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setAncla(data.hoy)}>
          Hoy
        </Button>
        <div className="flex">
          <Button size="icon" variant="ghost" aria-label="Anterior" onClick={() => mover(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Siguiente" onClick={() => mover(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h3 className="order-first w-full truncate text-[15px] font-semibold sm:order-none sm:w-auto sm:flex-1">
          {rangeLabel(vista, ancla)}
        </h3>
        <Segmentado
          valor={vista}
          opciones={[
            ["dia", "Día"],
            ["semana", "Semana"],
          ]}
          onChange={setVista}
        />
      </div>

      {especialidades.length > 1 && (
        <FiltroEspecialidad opciones={especialidades} valor={especialidad} onChange={setEspecialidad} />
      )}

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {delFiltro.map((a) => {
          const on = !ocultas.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setOcultas((s) => {
                  const n = new Set(s);
                  if (n.has(a.id)) n.delete(a.id);
                  else n.add(a.id);
                  return n;
                })
              }
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                on ? "bg-card text-foreground" : "bg-subtle text-text-3 line-through"
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorDeAgenda(indice.get(a.id) ?? 0) }} />
              {a.name}
              <span className="font-mono text-text-3">
                {a.opensAt}–{a.closesAt === "23:59" ? "24:00" : a.closesAt}
              </span>
            </button>
          );
        })}
        <span className="ml-auto hidden items-center gap-3 text-[11px] text-text-3 sm:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm border border-dashed border-border-strong" /> Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm border-2 border-dashed border-text-3" /> ≈ Estimado
          </span>
        </span>
      </div>

      {columnas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Elegí al menos una agenda.</p>
      ) : (
        <Rejilla
          columnas={columnas}
          franja={franja}
          hoy={data.hoy}
          reloj={reloj}
          multiDia={vista === "semana"}
          render={(c) => {
            const items = layoutOverlaps(delDia(c.day, c.agenda?.id));
            const agendasCol = c.agenda ? [c.agenda] : visibles;
            return (
              <>
                <Fuera agendas={agendasCol} franja={franja} />
                {c.agenda && c.agenda.walkInMode !== "queue" && c.day >= data.hoy && (
                  <Libres
                    agenda={c.agenda}
                    ocupados={items}
                    desdeMin={c.day === data.hoy ? reloj.minutes : null}
                    franja={franja}
                  />
                )}
                {items.map((u) => (
                  <Bloque
                    key={u.turno.id}
                    u={u}
                    franja={franja}
                    color={colorDeAgenda(indice.get(u.turno.agendaId) ?? 0)}
                    tz={tz}
                    esHoy={c.day === data.hoy}
                    ahora={ahora}
                    angosto={vista === "semana"}
                    elegido={u.turno.id === elegido}
                    onClick={() => setElegido(u.turno.id)}
                  />
                ))}
              </>
            );
          }}
          encabezado={(c) =>
            c.agenda ? (
              <div className="flex flex-col items-center gap-0.5 px-1 py-2 text-center">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: colorDeAgenda(indice.get(c.agenda.id) ?? 0) }}
                  />
                  {c.agenda.name}
                </span>
                <span className="text-[11px] text-text-3">
                  {c.agenda.specialty && `${c.agenda.specialty} · `}
                  {c.agenda.room || "Sin consultorio"} · {delDia(c.day, c.agenda.id).length} turnos
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAncla(c.day);
                  setVista("dia");
                }}
                className="flex w-full flex-col items-center gap-0.5 py-2 hover:bg-row-hover"
                aria-label={`Ver el día ${c.day}`}
              >
                <span className={cn("kicker", c.day === data.hoy && "text-brand-text")}>{dayHeading(c.day).weekday}</span>
                <span
                  className={cn(
                    "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[17px] font-semibold tabular-nums",
                    c.day === data.hoy ? "bg-brand text-brand-fg" : "text-foreground"
                  )}
                >
                  {dayHeading(c.day).day}
                </span>
                <span className="text-[10.5px] text-text-3">{delDia(c.day).length || "—"}</span>
              </button>
            )
          }
        />
      )}

      {sel && (
        <Detalle
          t={sel}
          agenda={data.agendas.find((a) => a.id === sel.agendaId) ?? null}
          color={colorDeAgenda(indice.get(sel.agendaId) ?? 0)}
          tz={tz}
          hoy={data.hoy}
          ahora={ahora}
          onClose={() => setElegido(null)}
          onDone={() => {
            setElegido(null);
            void refetch();
          }}
        />
      )}
    </div>
  );
}

function Segmentado<T extends string>({
  valor,
  opciones,
  onChange,
}: {
  valor: T;
  opciones: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="flex rounded-md border bg-subtle p-0.5 text-sm">
      {opciones.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={valor === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-3 py-1 transition-colors",
            valor === v ? "bg-card font-semibold text-foreground shadow-sm" : "text-text-3 hover:text-foreground"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Rejilla<C extends { key: string; day: string }>({
  columnas,
  franja,
  hoy,
  reloj,
  multiDia,
  render,
  encabezado,
}: {
  columnas: C[];
  franja: Franja;
  hoy: string;
  reloj: { day: string; minutes: number };
  multiDia: boolean;
  render: (c: C) => React.ReactNode;
  encabezado: (c: C) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const alto = ((franja.endMin - franja.startMin) / 60) * HORA_PX;
  const horas = Array.from({ length: (franja.endMin - franja.startMin) / 60 + 1 }, (_, i) => franja.startMin + i * 60);
  const lineaAhora = reloj.minutes >= franja.startMin && reloj.minutes <= franja.endMin;

  // Hoy abre cerca de la hora actual; una sola vez por franja, para que un
  // refresco por SSE no mueva lo que alguien está leyendo.
  const clave = `${columnas[0]?.day}|${franja.startMin}`;
  const hecho = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || hecho.current === clave) return;
    hecho.current = clave;
    const enHoy = columnas.some((c) => c.day === hoy) && lineaAhora;
    el.scrollTop = enHoy ? Math.max(0, ((reloj.minutes - franja.startMin - 60) / 60) * HORA_PX) : 0;
  }, [clave, columnas, hoy, lineaAhora, reloj.minutes, franja.startMin]);

  return (
    <div
      ref={ref}
      className="relative min-h-[420px] flex-1 overflow-auto rounded-lg border bg-card"
      style={{ "--cal-hour": `${HORA_PX}px`, maxHeight: "calc(100dvh - 15rem)" } as React.CSSProperties}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `3.25rem repeat(${columnas.length}, minmax(${multiDia ? "6rem" : "11rem"}, 1fr))`,
        }}
      >
        <div className="sticky left-0 top-0 z-40 border-b border-r bg-card" />
        {columnas.map((c) => (
          <div key={c.key} className="sticky top-0 z-30 border-b border-l bg-card">
            {encabezado(c)}
          </div>
        ))}

        <div className="sticky left-0 z-20 border-r bg-card" style={{ height: alto }}>
          {horas.slice(1, -1).map((m) => (
            <span
              key={m}
              className="absolute right-1.5 -translate-y-1/2 font-mono text-[10.5px] text-text-3"
              style={{ top: ((m - franja.startMin) / 60) * HORA_PX }}
            >
              {hhmm(m)}
            </span>
          ))}
        </div>

        {columnas.map((c) => (
          <div
            key={c.key}
            data-dia={c.day}
            className={cn("cal-hours relative isolate border-l", c.day === hoy && multiDia && "bg-row-hover")}
            style={{ height: alto, backgroundPositionY: `${-((franja.startMin % 60) / 60) * HORA_PX}px` }}
          >
            {render(c)}
            {c.day === hoy && lineaAhora && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger"
                style={{ top: ((reloj.minutes - franja.startMin) / 60) * HORA_PX }}
              >
                <span className="absolute -left-[5px] -top-[6px] h-2.5 w-2.5 rounded-full bg-danger" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lo que ninguna de esas agendas atiende: sombreado. */
function Fuera({ agendas, franja }: { agendas: Agenda[]; franja: Franja }) {
  if (agendas.length === 0) return null;
  const abre = Math.min(...agendas.map((a) => aMinutos(a.opensAt)));
  const cierra = Math.max(...agendas.map((a) => aMinutos(a.closesAt)));
  const bandas = [
    { startMin: franja.startMin, endMin: abre },
    { startMin: cierra, endMin: franja.endMin },
  ].filter((b) => b.endMin > b.startMin);
  return (
    <>
      {bandas.map((b) => (
        <div
          key={b.startMin}
          aria-hidden
          className="cal-off pointer-events-none absolute inset-x-0"
          style={{
            top: ((b.startMin - franja.startMin) / 60) * HORA_PX,
            height: ((b.endMin - b.startMin) / 60) * HORA_PX,
          }}
        />
      ))}
    </>
  );
}

function Libres({
  agenda,
  ocupados,
  desdeMin,
  franja,
}: {
  agenda: Agenda;
  ocupados: Franja[];
  desdeMin: number | null;
  franja: Franja;
}) {
  return (
    <>
      {huecosDelDia(agenda, ocupados, desdeMin).map((h) => (
        <div
          key={h.startMin}
          data-libre={hhmm(h.startMin)}
          className="pointer-events-none absolute inset-x-1 flex items-start rounded-[6px] border border-dashed px-1.5 pt-0.5 font-mono text-[10.5px] text-text-3"
          style={{
            top: ((h.startMin - franja.startMin) / 60) * HORA_PX + 1,
            height: ((h.endMin - h.startMin) / 60) * HORA_PX - 2,
          }}
        >
          {hhmm(h.startMin)} libre
        </div>
      ))}
    </>
  );
}

function Bloque({
  u,
  franja,
  color,
  tz,
  esHoy,
  ahora,
  angosto,
  elegido,
  onClick,
}: {
  u: Ubicado;
  franja: Franja;
  color: string;
  tz: string;
  esHoy: boolean;
  ahora: number;
  angosto: boolean;
  elegido: boolean;
  onClick: () => void;
}) {
  const t = u.turno;
  const alto = Math.max(16, ((u.endMin - u.startMin) / 60) * HORA_PX - 2);
  const compacto = alto < 44;
  const pasado = t.status === "finished" || t.status === "absent";
  const cuando = esHoy && t.status === "waiting" ? falta(Date.parse(t.estimatedAt ?? t.startAt) - ahora) : null;
  const hora = `${t.aproximado ? "≈ " : ""}${hhmm(u.startMin)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      data-turno={t.code}
      aria-label={`${t.code} ${t.displayName}, ${hora}`}
      className={cn(
        "absolute z-10 overflow-hidden rounded-[6px] border-l-[3px] px-1.5 text-left text-[11.5px] leading-tight text-foreground shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft",
        compacto ? "flex items-center gap-1.5" : "py-1",
        t.aproximado && "border border-l-[3px] border-dashed",
        pasado && "opacity-55",
        t.status === "called" && "ring-2 ring-warning",
        t.status === "in_service" && "ring-2 ring-success",
        elegido && "ring-2 ring-brand ring-offset-1 ring-offset-background"
      )}
      style={{
        top: ((u.startMin - franja.startMin) / 60) * HORA_PX + 1,
        height: alto,
        left: `calc(${(u.col / u.cols) * 100}% + 2px)`,
        width: `calc(${100 / u.cols}% - 4px)`,
        borderLeftColor: color,
        borderColor: t.aproximado ? color : undefined,
        background: `color-mix(in srgb, ${color} 16%, var(--bg-raised))`,
      }}
    >
      <span className="flex w-full min-w-0 items-center gap-1 font-semibold">
        <span className="shrink-0 font-mono text-[10.5px]">{hora}</span>
        <span className="truncate">{t.displayName}</span>
        {compacto && !angosto && (cuando || ESTADO[t.status]) && (
          <span className={cn("ml-auto shrink-0 text-[10.5px] font-medium", cuando ? "text-brand-text" : "text-text-2")}>
            {ESTADO[t.status] ?? cuando}
          </span>
        )}
      </span>
      {!compacto && (
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10.5px] text-text-2">
          <span className="font-mono">{t.code}</span>
          {!angosto && <span className="truncate">· {horaDe(t, tz)}</span>}
        </span>
      )}
      {!compacto && (cuando || ESTADO[t.status]) && (
        <span className={cn("mt-0.5 block truncate text-[10.5px] font-medium", cuando ? "text-brand-text" : "text-text-2")}>
          {ESTADO[t.status] ?? cuando}
        </span>
      )}
    </button>
  );
}

function horaDe(t: Turno, tz: string): string {
  if (t.source === "booking") return "Cita";
  if (t.scheduledAt) return "Reserva";
  return t.aproximado ? "Por orden de llegada" : hhmm(wallClock(t.startAt, tz).minutes);
}

function Detalle({
  t,
  agenda,
  color,
  tz,
  hoy,
  ahora,
  onClose,
  onDone,
}: {
  t: Turno;
  agenda: Agenda | null;
  color: string;
  tz: string;
  hoy: string;
  ahora: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const inicio = wallClock(t.startAt, tz);
  const fin = hhmm(inicio.minutes + t.minutes);

  async function accionar(to: "called" | "cancelled") {
    if (to === "cancelled" && !confirm(`¿Cancelar el turno de ${t.displayName}? No se le avisa por WhatsApp.`)) return;
    setError(null);
    const res = await fetch(`/api/turnos/turns/${t.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expected: "waiting", to }),
    }).catch(() => null);
    if (!res?.ok) {
      const b = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(b?.error?.message ?? "No se pudo.");
      return;
    }
    onDone();
  }

  return (
    <div
      role="dialog"
      aria-label={`Turno ${t.code}`}
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-xl border bg-popover p-4 shadow-pop sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-24 sm:w-80 sm:rounded-xl"
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{t.displayName}</p>
          <p className="text-xs text-text-3">
            {agenda?.name}
            {agenda?.room ? ` · ${agenda.room}` : ""}
          </p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Cerrar" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-text-3">Número</dt>
        <dd className="font-mono font-semibold">{t.code}</dd>
        <dt className="text-text-3">Horario</dt>
        <dd>
          {t.aproximado ? "≈ " : ""}
          {hhmm(inicio.minutes)} – {fin}
          {t.day === hoy && t.status === "waiting" && (
            <span className="ml-1.5 font-medium text-brand-text">({falta(Date.parse(t.estimatedAt ?? t.startAt) - ahora)})</span>
          )}
        </dd>
        <dt className="text-text-3">Tipo</dt>
        <dd>{t.source === "booking" ? "Cita" : t.scheduledAt ? "Con horario (reserva)" : "Por orden de llegada"}</dd>
        {t.scheduledAt && t.estimatedAt && t.status === "waiting" && (
          <>
            <dt className="text-text-3">Estimado</dt>
            <dd>{hhmm(wallClock(t.estimatedAt, tz).minutes)}</dd>
          </>
        )}
        <dt className="text-text-3">Estado</dt>
        <dd className="flex flex-wrap gap-1">
          <Badge variant="secondary">{ESTADO[t.status] ?? "En espera"}</Badge>
          {t.confirmed && <Badge variant="success">Confirmó</Badge>}
          {t.whatsapp && (
            <Badge variant="outline">
              <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
            </Badge>
          )}
        </dd>
      </dl>
      {t.status === "waiting" && t.day >= hoy && (
        <div className="mt-4 flex flex-wrap gap-2">
          {t.day === hoy && (
            <Button size="sm" onClick={() => void accionar("called")}>
              Llamar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => void accionar("cancelled")}>
            Cancelar turno
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger-text">{error}</p>}
    </div>
  );
}

/** Filtro por especialidad (Hoy y Agenda); solo se muestra con dos o más. */
export function FiltroEspecialidad({
  opciones,
  valor,
  onChange,
}: {
  opciones: string[];
  valor: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Especialidad">
      {[null, ...opciones].map((e) => (
        <button
          key={e ?? ""}
          type="button"
          aria-pressed={valor === e}
          onClick={() => onChange(e)}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
            valor === e ? "border-foreground bg-foreground text-background" : "text-text-2 hover:border-border-strong"
          )}
        >
          {e ?? "Todas"}
        </button>
      ))}
    </div>
  );
}

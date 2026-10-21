// Wait-time estimation for one agenda on one day. Pure, no DB.

import type { TurnStatus } from "./transitions";

export type EstimateTurn = {
  id: string;
  number: number;
  status: TurnStatus;
  scheduledAt: Date | null; // null for queue turns
  startedAt: Date | null;
  finishedAt: Date | null;
  /** 039 — Cuándo se sumó. En una fila mixta ordena a quien vino sin cita. */
  joinedAt?: Date | null;
};

export type TurnEstimate = { peopleBefore: number; estimatedAt: Date };

export type AgendaEstimate = {
  averageMinutes: number;
  delayMinutes: number; // always 0 for queue agendas
  turns: Map<string, TurnEstimate>; // only called and waiting turns
};

const MINUTE = 60_000;
const HISTORY = 5;
const MIN_HISTORY = 2;

/** Average of the last 5 finished turns; falls back to slotMinutes with fewer than 2. */
export function averageMinutes(turns: EstimateTurn[], slotMinutes: number): number {
  const done = turns
    .filter((t) => t.status === "finished" && t.startedAt && t.finishedAt)
    .sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime())
    .slice(0, HISTORY);
  if (done.length < MIN_HISTORY) return slotMinutes;
  const total = done.reduce((sum, t) => sum + (t.finishedAt!.getTime() - t.startedAt!.getTime()), 0);
  return total / done.length / MINUTE;
}

/** Delay = how late the turn in service started vs its appointment. */
export function delayMinutes(turns: EstimateTurn[]): number {
  const current = turns.find((t) => t.status === "in_service");
  if (!current?.startedAt || !current.scheduledAt) return 0;
  return Math.max(0, (current.startedAt.getTime() - current.scheduledAt.getTime()) / MINUTE);
}

/**
 * Queue: now (or estimated end of the turn in service) + people before × average.
 * Appointments: each one = max(scheduledAt, previous estimate + average).
 * Both are the same chain; queue turns just have no scheduledAt.
 * Order: called first, then by scheduledAt (appointments) or number (queue).
 */
export function estimateAgenda(turns: EstimateTurn[], slotMinutes: number, now: Date): AgendaEstimate {
  const avg = averageMinutes(turns, slotMinutes) * MINUTE;
  const current = turns.find((t) => t.status === "in_service");
  let nextFree = Math.max(now.getTime(), current?.startedAt ? current.startedAt.getTime() + avg : 0);

  const pending = turns
    .filter((t) => t.status === "called" || t.status === "waiting")
    .sort(
      (a, b) =>
        Number(b.status === "called") - Number(a.status === "called") ||
        turno(a) - turno(b) ||
        a.number - b.number,
    );

  const estimates = new Map<string, TurnEstimate>();
  pending.forEach((t, i) => {
    const at = Math.max(t.scheduledAt?.getTime() ?? 0, nextFree);
    estimates.set(t.id, { peopleBefore: i, estimatedAt: new Date(at) });
    nextFree = at + avg;
  });

  return { averageMinutes: avg / MINUTE, delayMinutes: delayMinutes(turns), turns: estimates };
}

/**
 * 039 — La hora que le «toca» a cada uno en la fila: la de su cita, o la hora
 * en que se sumó si vino sin cita. Así, en una agenda que mezcla citas y gente
 * sin turno, la cita de las 16:00 pasa delante de quien llegó a las 16:05, y
 * detrás de quien estaba desde las 15:30. Sin `joinedAt` (agendas solo de
 * fila o solo de citas, como en el POC) el orden es el de antes.
 *
 * ponytail: quien llega sin cita cinco minutos antes de una cita la atrasa;
 * si molesta, reservar el hueco de la cita (que la gente sin turno solo tome
 * los huecos que caben antes).
 */
function turno(t: EstimateTurn): number {
  return t.scheduledAt?.getTime() ?? t.joinedAt?.getTime() ?? 0;
}

/** Times shown to people are rounded to the nearest 5 minutes. */
export function roundToFive(date: Date): Date {
  const step = 5 * MINUTE;
  return new Date(Math.round(date.getTime() / step) * step);
}

const ACTIVE = new Set(["in_service", "called", "waiting"]);

/** Active turns in attention order: in service first, then as estimateAgenda orders them. */
export function attentionOrder<T extends EstimateTurn>(turns: T[], estimate: AgendaEstimate): T[] {
  const rank = (t: T) => (t.status === "in_service" ? -1 : (estimate.turns.get(t.id)?.peopleBefore ?? Infinity));
  return turns.filter((t) => ACTIVE.has(t.status)).sort((a, b) => rank(a) - rank(b));
}

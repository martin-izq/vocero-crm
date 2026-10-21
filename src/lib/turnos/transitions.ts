// Máquina de estados del turno (portada de turnos-en-vivo). Pura: la capa de
// datos aplica el parche con `update turn set ... where id = $1 and status =
// $esperado`, así que gana el primero que acciona y el que llegó tarde recibe
// quién lo hizo en vez de un error.

export type TurnStatus = "waiting" | "called" | "in_service" | "finished" | "cancelled" | "absent";
export type Actor = "client" | "reception" | "agent" | "system";

const ALLOWED: Record<TurnStatus, readonly TurnStatus[]> = {
  waiting: ["called", "cancelled", "absent"], // absent only when closing the day
  called: ["in_service", "waiting"], // waiting = no-show, re-enters as soon as they arrive
  in_service: ["finished"],
  finished: [],
  cancelled: [],
  absent: [],
};

export type TurnState = {
  status: TurnStatus;
  statusChangedBy: Actor | null;
  statusChangedAt: Date | null;
};

export type TurnPatch = {
  status: TurnStatus;
  statusChangedBy: Actor;
  statusChangedAt: Date;
  calledAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
};

export type TransitionResult =
  | { kind: "ok"; patch: TurnPatch }
  | { kind: "stale"; current: TurnState } // someone else changed it first
  | { kind: "invalid" }; // never allowed from the expected status

export function canTransition(from: TurnStatus, to: TurnStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function planTransition(
  current: TurnState,
  expected: TurnStatus,
  to: TurnStatus,
  actor: Actor,
  now: Date,
): TransitionResult {
  if (!canTransition(expected, to)) return { kind: "invalid" };
  if (current.status !== expected) return { kind: "stale", current };

  const patch: TurnPatch = { status: to, statusChangedBy: actor, statusChangedAt: now };
  if (to === "called") patch.calledAt = now;
  if (to === "in_service") patch.startedAt = now;
  if (to === "finished") patch.finishedAt = now;
  return { kind: "ok", patch };
}

const VERB: Record<TurnStatus, string> = {
  waiting: "Lo volvió a la fila",
  called: "Lo llamó",
  in_service: "Lo comenzó",
  finished: "Lo terminó",
  cancelled: "Lo canceló",
  absent: "Lo marcó ausente",
};
const WHO: Record<Actor, string> = {
  client: "el paciente",
  reception: "recepción",
  agent: "el asistente",
  system: "el sistema",
};

/** "Lo terminó recepción a las 16:45": shown instead of an error when an action lost the race. */
export function staleMessage(current: TurnState, formatTime: (d: Date) => string): string {
  const who = current.statusChangedBy ? ` ${WHO[current.statusChangedBy]}` : "";
  const when = current.statusChangedAt ? ` a las ${formatTime(current.statusChangedAt)}` : "";
  return `${VERB[current.status]}${who}${when}.`;
}

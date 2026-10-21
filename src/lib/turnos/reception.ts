// What the reception panel's main button does for an agenda. Pure.

import type { TurnStatus } from "./transitions";

export type Step = { turnId: string; expected: TurnStatus; to: TurnStatus };
export type MainAction = { label: string; steps: Step[] };

type Row = { id: string; status: TurnStatus };

/** `ordered` is the agenda in attention order (see estimateAgenda). */
export function mainAction(ordered: Row[]): MainAction | null {
  const serving = ordered.find((t) => t.status === "in_service");
  const called = ordered.find((t) => t.status === "called");
  const next = ordered.find((t) => t.status === "waiting");

  if (serving) {
    const finish: Step = { turnId: serving.id, expected: "in_service", to: "finished" };
    if (!called && next)
      return { label: "Terminar y llamar al siguiente", steps: [finish, { turnId: next.id, expected: "waiting", to: "called" }] };
    return { label: "Terminar turno", steps: [finish] };
  }
  if (called) return { label: "Comenzar turno", steps: [{ turnId: called.id, expected: "called", to: "in_service" }] };
  if (next) return { label: "Llamar al siguiente", steps: [{ turnId: next.id, expected: "waiting", to: "called" }] };
  return null;
}

import { expect, test } from "vitest";
import { planTransition, staleMessage, type TurnState } from "@/lib/turnos/transitions";

const now = new Date("2026-10-05T17:00:00-03:00");
const state = (status: TurnState["status"]): TurnState => ({ status, statusChangedBy: null, statusChangedAt: null });

test("happy path sets the matching timestamp", () => {
  expect(planTransition(state("waiting"), "waiting", "called", "reception", now)).toEqual({
    kind: "ok",
    patch: { status: "called", statusChangedBy: "reception", statusChangedAt: now, calledAt: now },
  });
  const start = planTransition(state("called"), "called", "in_service", "reception", now);
  expect(start.kind === "ok" && start.patch.startedAt).toEqual(now);
  const end = planTransition(state("in_service"), "in_service", "finished", "reception", now);
  expect(end.kind === "ok" && end.patch.finishedAt).toEqual(now);
});

test("no-show: called goes back to waiting", () => {
  const r = planTransition(state("called"), "called", "waiting", "reception", now);
  expect(r).toEqual({ kind: "ok", patch: { status: "waiting", statusChangedBy: "reception", statusChangedAt: now } });
});

test("stale: someone else changed it first, return who and when", () => {
  const changedAt = new Date("2026-10-05T16:45:00-03:00");
  const current: TurnState = { status: "finished", statusChangedBy: "reception", statusChangedAt: changedAt };
  expect(planTransition(current, "in_service", "finished", "reception", now)).toEqual({ kind: "stale", current });
});

test("transitions outside the diagram are invalid", () => {
  expect(planTransition(state("waiting"), "waiting", "in_service", "reception", now).kind).toBe("invalid");
  expect(planTransition(state("called"), "called", "absent", "system", now).kind).toBe("invalid");
  expect(planTransition(state("in_service"), "in_service", "cancelled", "client", now).kind).toBe("invalid");
  expect(planTransition(state("finished"), "finished", "waiting", "reception", now).kind).toBe("invalid");
});

test("cancel and absent only from waiting", () => {
  expect(planTransition(state("waiting"), "waiting", "cancelled", "client", now).kind).toBe("ok");
  expect(planTransition(state("waiting"), "waiting", "absent", "system", now).kind).toBe("ok");
});

test("stale message names who changed it and when", () => {
  const current: TurnState = { status: "finished", statusChangedBy: "reception", statusChangedAt: new Date("2026-10-05T19:45:00Z") };
  const hhmm = (d: Date) => d.toISOString().slice(11, 16);
  expect(staleMessage(current, hhmm)).toBe("Lo terminó recepción a las 19:45.");
});

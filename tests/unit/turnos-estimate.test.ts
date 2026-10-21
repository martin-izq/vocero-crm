import { describe, expect, test } from "vitest";
import { attentionOrder, averageMinutes, estimateAgenda, roundToFive, type EstimateTurn } from "@/lib/turnos/estimate";

const T = new Date("2026-10-05T17:00:00-03:00");
const at = (min: number) => new Date(T.getTime() + min * 60_000);

let seq = 0;
function turn(p: Partial<EstimateTurn> & Pick<EstimateTurn, "status">): EstimateTurn {
  seq += 1;
  return { id: `t${seq}`, number: seq, scheduledAt: null, startedAt: null, finishedAt: null, ...p };
}

describe("queue", () => {
  const turns = [
    turn({ number: 21, status: "finished", startedAt: at(-48), finishedAt: at(-36) }),
    turn({ number: 22, status: "finished", startedAt: at(-36), finishedAt: at(-25) }),
    turn({ number: 23, status: "finished", startedAt: at(-25), finishedAt: at(-12) }),
    turn({ number: 24, status: "in_service", startedAt: at(-12) }),
    turn({ id: "a25", number: 25, status: "waiting" }),
    turn({ id: "a27", number: 27, status: "waiting" }),
    turn({ id: "a26", number: 26, status: "waiting" }),
  ];

  test("people before and estimated time follow number order", () => {
    const est = estimateAgenda(turns, 12, T);
    expect(est.averageMinutes).toBe(12);
    expect(est.delayMinutes).toBe(0);
    expect(est.turns.get("a25")).toEqual({ peopleBefore: 0, estimatedAt: at(0) });
    expect(est.turns.get("a27")).toEqual({ peopleBefore: 2, estimatedAt: at(24) });
  });

  test("an overrunning turn in service pushes from now, not from the past", () => {
    const est = estimateAgenda(turns, 12, at(10));
    expect(est.turns.get("a25")?.estimatedAt).toEqual(at(10));
  });

  test("a called turn goes first", () => {
    const withCalled = [...turns, turn({ id: "a28", number: 28, status: "called" })];
    const est = estimateAgenda(withCalled, 12, T);
    expect(est.turns.get("a28")?.peopleBefore).toBe(0);
    expect(est.turns.get("a25")?.peopleBefore).toBe(1);
  });
});

describe("appointments with delay", () => {
  const turns = [
    turn({ status: "finished", scheduledAt: at(-120), startedAt: at(-105), finishedAt: at(-80) }),
    turn({ status: "finished", scheduledAt: at(-100), startedAt: at(-80), finishedAt: at(-50) }),
    turn({ status: "finished", scheduledAt: at(-80), startedAt: at(-50), finishedAt: at(-20) }),
    turn({ status: "in_service", scheduledAt: at(-60), startedAt: at(-20) }),
    turn({ id: "p8", status: "waiting", scheduledAt: at(20) }),
    turn({ id: "p5", status: "waiting", scheduledAt: at(-40) }),
    turn({ id: "p6", status: "waiting", scheduledAt: at(-20) }),
    turn({ id: "p7", status: "waiting", scheduledAt: at(0) }),
  ];

  test("delay comes from the turn in service", () => {
    const est = estimateAgenda(turns, 20, T);
    expect(est.delayMinutes).toBe(40);
    expect(est.averageMinutes).toBeCloseTo(85 / 3);
  });

  test("each appointment chains from the previous estimate, ordered by schedule", () => {
    const est = estimateAgenda(turns, 20, T);
    const avg = 85 / 3;
    expect(est.turns.get("p5")?.peopleBefore).toBe(0);
    expect(est.turns.get("p5")?.estimatedAt.getTime()).toBeCloseTo(at(-20 + avg).getTime());
    expect(est.turns.get("p8")?.peopleBefore).toBe(3);
    expect(est.turns.get("p8")?.estimatedAt.getTime()).toBeCloseTo(at(-20 + 4 * avg).getTime());
    expect(roundToFive(est.turns.get("p8")!.estimatedAt)).toEqual(at(95));
  });

  test("an appointment far ahead keeps its scheduled time", () => {
    const est = estimateAgenda([...turns, turn({ id: "late", status: "waiting", scheduledAt: at(300) })], 20, T);
    expect(est.turns.get("late")?.estimatedAt).toEqual(at(300));
  });
});

describe("agenda without history", () => {
  test("uses slot minutes with fewer than 2 finished turns", () => {
    const one = [turn({ status: "finished", startedAt: at(-30), finishedAt: at(-5) })];
    expect(averageMinutes([], 30)).toBe(30);
    expect(averageMinutes(one, 30)).toBe(30);
  });

  test("first appointment on an idle agenda is on time", () => {
    const est = estimateAgenda([turn({ id: "h2", status: "waiting", scheduledAt: at(30) })], 30, T);
    expect(est.delayMinutes).toBe(0);
    expect(est.turns.get("h2")).toEqual({ peopleBefore: 0, estimatedAt: at(30) });
  });

  test("average only uses the last 5 finished", () => {
    const old = turn({ status: "finished", startedAt: at(-300), finishedAt: at(-200) });
    const recent = [1, 2, 3, 4, 5].map((i) => turn({ status: "finished", startedAt: at(-i * 10 - 10), finishedAt: at(-i * 10) }));
    expect(averageMinutes([old, ...recent], 30)).toBe(10);
  });
});

test("roundToFive rounds to the nearest 5 minutes", () => {
  expect(roundToFive(at(2))).toEqual(at(0));
  expect(roundToFive(at(3))).toEqual(at(5));
});

test("attentionOrder puts the turn in service first and drops finished ones", () => {
  const turns = [
    turn({ id: "w2", number: 3, status: "waiting" }),
    turn({ id: "done", number: 1, status: "finished", startedAt: at(-20), finishedAt: at(-10) }),
    turn({ id: "w1", number: 2, status: "waiting" }),
    turn({ id: "now", number: 4, status: "in_service", startedAt: at(-5) }),
  ];
  expect(attentionOrder(turns, estimateAgenda(turns, 10, T)).map((t) => t.id)).toEqual(["now", "w1", "w2"]);
});

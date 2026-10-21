import { expect, test } from "vitest";
import { nextFreeSlot } from "@/lib/turnos/slots";
import { horaLocal } from "@/lib/turnos/format";
import { dayIsoInTz, zonedWallClockToUtc } from "@/lib/time/slots";

const zonedDate = (d: string, t: string, tz: string) => zonedWallClockToUtc(d, t, tz)!;

const TZ = "America/Argentina/Tucuman";
const T = new Date("2026-10-05T17:00:00-03:00");
const at = (min: number) => new Date(T.getTime() + min * 60_000);
const opens = zonedDate("2026-10-05", "08:00", TZ);
const closes = zonedDate("2026-10-05", "20:00", TZ);

test("zonedDate and local formatting round-trip in the business timezone", () => {
  expect(opens.toISOString()).toBe("2026-10-05T11:00:00.000Z");
  expect(horaLocal(closes, TZ)).toBe("20:00");
  expect(dayIsoInTz(new Date("2026-10-06T02:30:00Z"), TZ)).toBe("2026-10-05");
});

test("takes the first gap after the booked block (Dra. Paz seed)", () => {
  const booked = [-120, -100, -80, -60, -40, -20, 0, 20].map(at);
  expect(nextFreeSlot(booked, 20, opens, closes, T)).toEqual(at(40));
});

test("takes a hole in the middle of the day", () => {
  const booked = [0, 20, 60].map(at);
  expect(nextFreeSlot(booked, 20, opens, closes, at(-2))).toEqual(at(40));
});

test("empty agenda: now rounded up to 5 minutes", () => {
  expect(nextFreeSlot([], 30, opens, closes, at(2))).toEqual(at(5));
});

test("before opening, starts at opening time", () => {
  expect(nextFreeSlot([], 30, opens, closes, zonedDate("2026-10-05", "06:00", TZ))).toEqual(opens);
});

test("null when the slot no longer fits before closing", () => {
  expect(nextFreeSlot([], 30, opens, closes, zonedDate("2026-10-05", "19:40", TZ))).toBeNull();
});

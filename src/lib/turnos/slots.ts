// Next free appointment slot for walk-ins in "gaps" agendas. Pure.

const MINUTE = 60_000;
const STEP = 5 * MINUTE;

/**
 * Earliest start >= now (rounded up to 5 min) where a slot of `slotMinutes`
 * fits between opens/closes without overlapping an active appointment.
 * Candidates are "now" and the end of each appointment, so slots line up with
 * the existing schedule. Null if the day is full.
 */
export function nextFreeSlot(
  appointments: Date[],
  slotMinutes: number,
  opens: Date,
  closes: Date,
  now: Date,
): Date | null {
  const len = slotMinutes * MINUTE;
  const from = Math.max(opens.getTime(), Math.ceil(now.getTime() / STEP) * STEP);
  const busy = appointments.map((a) => a.getTime());
  const candidates = [from, ...busy.map((s) => s + len).filter((e) => e > from)].sort((a, b) => a - b);
  const free = candidates.find((c) => c + len <= closes.getTime() && busy.every((s) => s + len <= c || s >= c + len));
  return free === undefined ? null : new Date(free);
}

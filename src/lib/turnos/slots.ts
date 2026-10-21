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

/**
 * 039 — Los huecos reservables de un día: cada `slotMinutes` desde la
 * apertura (la grilla de la agenda), que terminen antes del cierre, que no
 * pisen un turno con horario activo y que empiecen después de `desde` (ahora +
 * aviso mínimo, si el día es hoy). Es lo que se le ofrece al paciente para
 * reservar una hora puntual; la reserva solo acepta uno de estos.
 */
export function huecosLibres(
  ocupados: Date[],
  slotMinutes: number,
  opens: Date,
  closes: Date,
  desde: Date,
): Date[] {
  const len = slotMinutes * MINUTE;
  const busy = ocupados.map((a) => a.getTime());
  const out: Date[] = [];
  for (let c = opens.getTime(); c + len <= closes.getTime(); c += len) {
    if (c < desde.getTime()) continue;
    if (busy.some((s) => s < c + len && c < s + len)) continue;
    out.push(new Date(c));
  }
  return out;
}

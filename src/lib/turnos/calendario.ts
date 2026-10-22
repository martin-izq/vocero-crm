// La rejilla de horas de la pestaña «Calendario»: qué franja mostrar, qué huecos
// quedan libres y cuánto falta. Pura, en minutos del día del negocio.

export type Franja = { startMin: number; endMin: number };

/** "09:30" → 570. "23:59" cuenta como el fin del día. */
export function aMinutos(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const min = h * 60 + m;
  return min >= 1439 ? 1440 : min;
}

/**
 * Las horas que muestra la rejilla: del primer horario de apertura al último
 * de cierre entre las agendas visibles, en horas enteras, estirado si algún
 * turno cae afuera. Sin agendas, 8 a 20.
 */
export function franjaVisible(agendas: { opensAt: string; closesAt: string }[], turnos: Franja[] = []): Franja {
  const inicios = [...agendas.map((a) => aMinutos(a.opensAt)), ...turnos.map((t) => t.startMin)];
  const fines = [...agendas.map((a) => aMinutos(a.closesAt)), ...turnos.map((t) => t.endMin)];
  if (inicios.length === 0) return { startMin: 8 * 60, endMin: 20 * 60 };
  const desde = Math.floor(Math.min(...inicios) / 60) * 60;
  const hasta = Math.min(1440, Math.ceil(Math.max(...fines) / 60) * 60);
  return { startMin: desde, endMin: Math.max(hasta, desde + 60) };
}

/**
 * Los huecos libres de una agenda ese día: la grilla de `slotMinutes` desde
 * que abre, sin lo que pisa un turno y sin lo que ya empezó (`desdeMin`).
 */
export function huecosDelDia(
  agenda: { opensAt: string; closesAt: string; slotMinutes: number },
  ocupados: Franja[],
  desdeMin: number | null = null
): Franja[] {
  const out: Franja[] = [];
  const paso = Math.max(5, agenda.slotMinutes);
  const cierra = aMinutos(agenda.closesAt);
  for (let m = aMinutos(agenda.opensAt); m + paso <= cierra; m += paso) {
    if (desdeMin !== null && m < desdeMin) continue;
    if (ocupados.some((o) => o.startMin < m + paso && o.endMin > m)) continue;
    out.push({ startMin: m, endMin: m + paso });
  }
  return out;
}

/** "ahora", "en 25 min", "en 1 h 20 min", "hace 10 min". */
export function falta(ms: number): string {
  const min = Math.round(Math.abs(ms) / 60_000);
  if (min < 1) return "ahora";
  const texto = min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min / 60} h`;
  return ms > 0 ? `en ${texto}` : `hace ${texto}`;
}

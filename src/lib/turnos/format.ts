// Formatos que ven pacientes y recepción. Intl a secas, sin librerías.

/** "25 minutos", "1 h 35 min": redondeado a 5 minutos, nunca negativo. */
export function duracion(minutos: number): string {
  const m = Math.max(0, Math.round(minutos / 5) * 5);
  if (m < 60) return `${m} minutos`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

/** "16:45" en la zona del negocio. */
export function horaLocal(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/** "A-27". */
export function codigo(prefijo: string, numero: number): string {
  return `${prefijo}-${numero}`;
}

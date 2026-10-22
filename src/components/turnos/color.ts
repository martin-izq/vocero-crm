/**
 * 039 — Un tono por agenda, estable por su posición: el mismo en Hoy, Agenda
 * y la sala. Tonos medios, legibles en claro y oscuro (la excepción de la
 * paleta de identidad de `tailwind.config.ts`).
 */
export function colorDeAgenda(i: number): string {
  return `hsl(${(i * 67 + 215) % 360} 70% 52%)`;
}

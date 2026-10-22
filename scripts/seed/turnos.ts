/**
 * 039 — Seed de Turnos para probar a mano: `pnpm seed:turnos`.
 *
 * Crea cinco agendas de demo (una por modo de atención, una apagada) con
 * historial de los últimos días, la fila de HOY armada alrededor de la hora
 * actual (atendidos, en consultorio, llamado, esperando, ausente) y reservas
 * para la semana que viene. Re-ejecutable: borra y recrea SOLO las agendas
 * con las letras de abajo; las demás no se tocan.
 *
 * Los turnos no tienen conversación, así que el avisador no le manda nada a
 * nadie aunque se los llame o se cierre el día.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { addDaysISO, zonedWallClockToUtc } from "@/lib/time/slots";
import { businessTimezone } from "@/server/analytics/period";
import { hashToken, hoyEn, tokenDe } from "@/server/turnos/service";

type Agenda = typeof schema.queueAgenda.$inferInsert;
type Turno = typeof schema.turn.$inferInsert;

const AGENDAS: Omit<Agenda, "id" | "organizationId">[] = [
  { name: "Dra. Laura Méndez", room: "Consultorio 1", walkInMode: "gaps", slotMinutes: 15, opensAt: "08:00", closesAt: "14:00", numberPrefix: "M", notifyBefore: 2 },
  { name: "Dr. Pablo Sosa", room: "Consultorio 3", walkInMode: "queue", slotMinutes: 20, opensAt: "10:00", closesAt: "18:00", numberPrefix: "P", notifyBefore: 2 },
  { name: "Kinesiología", room: "Box 2", walkInMode: "none", slotMinutes: 45, opensAt: "08:00", closesAt: "20:00", numberPrefix: "K", notifyBefore: 1 },
  { name: "Laboratorio", room: "Extracciones", walkInMode: "queue", slotMinutes: 5, opensAt: "07:00", closesAt: "10:00", numberPrefix: "L", notifyBefore: 3 },
  { name: "Dra. Inés Ferrari", room: "Consultorio 5", walkInMode: "gaps", slotMinutes: 30, opensAt: "15:00", closesAt: "19:00", numberPrefix: "F", active: false },
];

const NOMBRES = [
  "Sofía Gómez", "Mateo Fernández", "Valentina López", "Benjamín Díaz", "Martina Romero", "Joaquín Torres",
  "Catalina Ruiz", "Thiago Álvarez", "Emilia Sánchez", "Lautaro Pereyra", "Isabella Castro", "Felipe Moreno",
  "Olivia Herrera", "Bautista Silva", "Mía Rojas", "Santino Medina", "Julieta Acosta", "Facundo Ríos",
  "Lucía Benítez", "Tomás Suárez", "Camila Ortiz", "Ignacio Vega", "Renata Molina", "Agustín Giménez",
  "Abril Navarro", "Franco Domínguez", "Delfina Ramos", "Nicolás Peralta", "Paula Cabrera", "Gonzalo Quiroga",
];

// PRNG con semilla: cada corrida arma la misma demo.
let semilla = 39;
function azar(): number {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
  return semilla / 0x7fffffff;
}
const nombre = () => NOMBRES[Math.floor(azar() * NOMBRES.length)]!;
const MIN = 60_000;
const sumar = (d: Date, min: number) => new Date(d.getTime() + min * MIN);

const db = getDb();
const [org] = await db.select().from(schema.organization).limit(1);
if (!org) {
  console.error("[seed:turnos] No hay organización: registrate primero en la app.");
  process.exit(1);
}
const tz = await businessTimezone(org.id);
const now = new Date();
const hoy = hoyEn(tz, now);

const letras = AGENDAS.map((a) => a.numberPrefix);
await db
  .delete(schema.queueAgenda)
  .where(and(eq(schema.queueAgenda.organizationId, org.id), inArray(schema.queueAgenda.numberPrefix, letras)));

let total = 0;
for (const def of AGENDAS) {
  const [agenda] = await db
    .insert(schema.queueAgenda)
    .values({ id: newId("queueAgenda"), organizationId: org.id, ...def })
    .returning();
  const a = agenda!;
  const turnos: Turno[] = [];

  for (let d = -3; d <= 6; d++) {
    const day = addDaysISO(hoy, d);
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) continue; // domingo cerrado
    if (!a.active && d >= 0) continue; // la apagada solo tiene historial
    const abre = zonedWallClockToUtc(day, a.opensAt, tz)!;
    const cierra = zonedWallClockToUtc(day, a.closesAt, tz)!;
    let numero = 0;
    let enConsultorio = false;
    let llamado = false;
    const alta = (t: Omit<Turno, "id" | "organizationId" | "agendaId" | "day" | "number" | "tokenHash" | "source">) => {
      const id = newId("turn");
      turnos.push({
        id,
        organizationId: org.id,
        agendaId: a.id,
        day,
        number: ++numero,
        tokenHash: hashToken(tokenDe(id)),
        source: t.scheduledAt ? "whatsapp" : "reception",
        statusChangedBy: "reception",
        statusChangedAt: t.finishedAt ?? t.startedAt ?? t.calledAt ?? t.joinedAt,
        ...t,
      });
    };

    if (a.walkInMode === "queue") {
      // Fila por número: llegan desde un rato antes de abrir.
      const cuantos = d === 0 ? 14 : d < 0 ? 10 : 0;
      let atiende = abre;
      for (let i = 0; i < cuantos; i++) {
        const joinedAt = sumar(abre, -20 + i * a.slotMinutes * 0.6);
        if (d === 0 && joinedAt > now) break;
        const inicio = atiende > joinedAt ? atiende : joinedAt;
        const fin = sumar(inicio, a.slotMinutes * (0.6 + azar() * 0.8));
        const yaPaso = d < 0 || fin <= now;
        if (yaPaso && azar() < 0.12) {
          alta({ displayName: nombre(), joinedAt, status: "absent", calledAt: inicio });
          continue;
        }
        if (yaPaso) {
          alta({ displayName: nombre(), joinedAt, status: "finished", calledAt: inicio, startedAt: inicio, finishedAt: fin });
          atiende = fin;
        } else if (!enConsultorio && inicio <= now && now < cierra) {
          alta({ displayName: nombre(), joinedAt, status: "in_service", calledAt: inicio, startedAt: inicio });
          enConsultorio = true;
          atiende = fin;
        } else if (enConsultorio && !llamado && now < cierra) {
          alta({ displayName: nombre(), joinedAt, status: "called", calledAt: sumar(now, -2) });
          llamado = true;
        } else {
          alta({ displayName: nombre(), joinedAt, status: "waiting", confirmedAt: azar() < 0.4 ? joinedAt : null });
        }
      }
    } else {
      // Con horario: reservas en una parte de los huecos; en `gaps` además
      // algún «por orden de llegada» metido en un hueco libre.
      const ocupacion = d < 0 ? 0.75 : d === 0 ? 0.65 : Math.max(0.15, 0.6 - d * 0.08);
      for (let slot = abre; sumar(slot, a.slotMinutes) <= cierra; slot = sumar(slot, a.slotMinutes)) {
        if (azar() > ocupacion) continue;
        const fin = sumar(slot, a.slotMinutes * (0.7 + azar() * 0.5));
        const sinReserva = a.walkInMode === "gaps" && d === 0 && azar() < 0.2;
        const joinedAt = sinReserva ? sumar(slot, -40) : sumar(slot, -60 * 24 * (1 + Math.floor(azar() * 5)));
        const base = { displayName: nombre(), scheduledAt: slot, joinedAt };
        if (d < 0 || (d === 0 && fin <= now)) {
          if (azar() < 0.1) alta({ ...base, status: "absent", calledAt: slot });
          else alta({ ...base, status: "finished", calledAt: slot, startedAt: slot, finishedAt: fin });
        } else if (d === 0 && !enConsultorio && slot <= now) {
          alta({ ...base, status: "in_service", calledAt: slot, startedAt: sumar(slot, 2) });
          enConsultorio = true;
        } else {
          const proximo = d === 0 && slot.getTime() - now.getTime() < 3 * 60 * MIN;
          alta({ ...base, status: "waiting", confirmedAt: proximo && azar() < 0.5 ? sumar(now, -30) : null });
        }
        if (sinReserva) turnos[turnos.length - 1]!.source = "reception";
      }
    }
  }

  // Un aviso que no salió: recepción tiene que llamarlo en la sala.
  const espera = turnos.find((t) => t.day === hoy && t.status === "waiting");
  if (espera) espera.noticeFailed = true;

  if (turnos.length) await db.insert(schema.turn).values(turnos);
  total += turnos.length;
  console.log(`[seed:turnos] ${a.numberPrefix} · ${a.name}: ${turnos.length} turnos${a.active ? "" : " (apagada)"}`);
}

console.log(`[seed:turnos] Listo: ${AGENDAS.length} agendas y ${total} turnos (hoy ${hoy}, ${tz}).`);
process.exit(0);

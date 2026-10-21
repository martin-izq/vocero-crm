import { createHash, createHmac } from "node:crypto";
import { asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { addDaysISO, dayIsoInTz, zonedWallClockToUtc } from "@/lib/time/slots";
import { avisosPendientes } from "@/lib/turnos/avisos";
import { attentionOrder, estimateAgenda, type AgendaEstimate, type EstimateTurn } from "@/lib/turnos/estimate";
import { codigo, horaLocal } from "@/lib/turnos/format";
import { mainAction, type MainAction } from "@/lib/turnos/reception";
import { nextFreeSlot } from "@/lib/turnos/slots";
import { planTransition, staleMessage, type Actor, type TurnStatus } from "@/lib/turnos/transitions";
import { markBookingStatus } from "@/server/agenda/service";
import { businessTimezone } from "@/server/analytics/period";
import { publish } from "@/server/events/bus";
import { sendButtons, sendText, SendError } from "@/server/inbox/send";

/**
 * 039 — Turnos en vivo: la fila del día de cada agenda, portada de
 * turnos-en-vivo sobre la base de Vocero. La lógica (estimación, estados,
 * huecos, botón de recepción, avisos) es pura y vive en `src/lib/turnos/`;
 * aquí solo se lee, se escribe y se avisa.
 *
 * Cada escritura termina en `despuesDelCambio`: publica `turno.changed` (la
 * recepción, la sala y los links se refrescan) y corre el avisador, que manda
 * por WhatsApp lo que corresponda y nunca lo mismo dos veces.
 */

export type AgendaRow = typeof schema.queueAgenda.$inferSelect;
export type TurnRow = typeof schema.turn.$inferSelect;

const ACTIVOS: TurnStatus[] = ["waiting", "called", "in_service"];

/* ------------------------------------------------------------------ */
/* Link del paciente                                                    */
/* ------------------------------------------------------------------ */

/**
 * El token del link se DERIVA del id del turno con un HMAC, en vez de
 * sortearse: así se puede volver a mandar el link («¿me pasás el link?») sin
 * guardarlo en claro. En la base queda solo su SHA-256, como en el POC.
 */
function tokenDe(turnId: string): string {
  const firma = createHmac("sha256", getEnv().ENCRYPTION_KEY)
    .update(`turnos:link:${turnId}`)
    .digest("base64url")
    .slice(0, 32);
  return `${turnId}.${firma}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function linkDelTurno(turnId: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/+$/, "")}/t/${tokenDe(turnId)}`;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

export function hoyEn(tz: string, now = new Date()): string {
  return dayIsoInTz(now, tz);
}

function paraEstimar(t: TurnRow): EstimateTurn {
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    scheduledAt: t.scheduledAt,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    joinedAt: t.joinedAt,
  };
}

export async function listarAgendas(organizationId: string, { soloActivas = false } = {}) {
  return getDb()
    .select()
    .from(schema.queueAgenda)
    .where(
      scoped(
        schema.queueAgenda.organizationId,
        organizationId,
        soloActivas ? eq(schema.queueAgenda.active, true) : undefined
      )
    )
    .orderBy(asc(schema.queueAgenda.createdAt));
}

async function agendaPropia(organizationId: string, agendaId: string): Promise<AgendaRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.queueAgenda)
    .where(scoped(schema.queueAgenda.organizationId, organizationId, eq(schema.queueAgenda.id, agendaId)))
    .limit(1);
  return rows[0] ?? null;
}

async function turnosDelDia(organizationId: string, agendaIds: string[], day: string): Promise<TurnRow[]> {
  if (agendaIds.length === 0) return [];
  return getDb()
    .select()
    .from(schema.turn)
    .where(
      scoped(
        schema.turn.organizationId,
        organizationId,
        inArray(schema.turn.agendaId, agendaIds),
        eq(schema.turn.day, day)
      )
    );
}

export type DiaDeAgenda = {
  agenda: AgendaRow;
  turns: TurnRow[];
  estimate: AgendaEstimate;
  /** Activos en orden de atención. */
  orden: TurnRow[];
  principal: MainAction | null;
};

function armarDia(agenda: AgendaRow, turns: TurnRow[], now: Date): DiaDeAgenda {
  const estimate = estimateAgenda(turns.map(paraEstimar), agenda.slotMinutes, now);
  const orden = attentionOrder(
    turns.map((t) => ({ ...paraEstimar(t), row: t })),
    estimate
  ).map((t) => t.row);
  return { agenda, turns, estimate, orden, principal: mainAction(orden) };
}

/** El día de todas las agendas activas, ya con las citas de hoy adentro. */
export async function tablero(organizationId: string, now = new Date()) {
  const tz = await businessTimezone(organizationId);
  const day = hoyEn(tz, now);
  await traerCitasDeHoy(organizationId, tz, day, now);
  const agendas = await listarAgendas(organizationId, { soloActivas: true });
  const turns = await turnosDelDia(organizationId, agendas.map((a) => a.id), day);
  return {
    timezone: tz,
    day,
    agendas: agendas.map((a) => armarDia(a, turns.filter((t) => t.agendaId === a.id), now)),
  };
}

/** Lo que se le muestra a recepción. Sin datos de otros negocios ni tokens. */
export function vistaTablero(t: Awaited<ReturnType<typeof tablero>>) {
  return {
    timezone: t.timezone,
    day: t.day,
    agendas: t.agendas.map((d) => ({
      id: d.agenda.id,
      name: d.agenda.name,
      room: d.agenda.room,
      walkInMode: d.agenda.walkInMode,
      numberPrefix: d.agenda.numberPrefix,
      slotMinutes: d.agenda.slotMinutes,
      opensAt: d.agenda.opensAt,
      closesAt: d.agenda.closesAt,
      notifyBefore: d.agenda.notifyBefore,
      receivesBookings: d.agenda.receivesBookings,
      averageMinutes: Math.round(d.estimate.averageMinutes),
      delayMinutes: Math.round(d.estimate.delayMinutes),
      principal: d.principal,
      turns: [...d.orden, ...d.turns.filter((t) => !ACTIVOS.includes(t.status))].map((t) => {
        const est = d.estimate.turns.get(t.id);
        return {
          id: t.id,
          code: codigo(d.agenda.numberPrefix, t.number),
          displayName: t.displayName,
          status: t.status,
          source: t.source,
          scheduledAt: t.scheduledAt?.toISOString() ?? null,
          estimatedAt: est?.estimatedAt.toISOString() ?? null,
          peopleBefore: est?.peopleBefore ?? null,
          confirmedAt: t.confirmedAt?.toISOString() ?? null,
          noticeFailed: t.noticeFailed,
          whatsapp: t.conversationId !== null,
          statusChangedBy: t.statusChangedBy,
          statusChangedAt: t.statusChangedAt?.toISOString() ?? null,
        };
      }),
    })),
  };
}

export type VistaTablero = ReturnType<typeof vistaTablero>;

/** Qué ve el paciente con su link. Nunca nombres de otros: solo números. */
export async function vistaPorToken(token: string, now = new Date()) {
  const db = getDb();
  const rows = await db
    .select({ turn: schema.turn, agenda: schema.queueAgenda, negocio: schema.organization.name })
    .from(schema.turn)
    .innerJoin(schema.queueAgenda, eq(schema.queueAgenda.id, schema.turn.agendaId))
    .innerJoin(schema.organization, eq(schema.organization.id, schema.turn.organizationId))
    .where(eq(schema.turn.tokenHash, hashToken(token)))
    .limit(1);
  const fila = rows[0];
  if (!fila) return null;
  const { turn, agenda } = fila;
  const tz = await businessTimezone(turn.organizationId);
  // Un link vive solo su día.
  if (turn.day < hoyEn(tz, now)) return null;

  const dia = armarDia(agenda, await turnosDelDia(turn.organizationId, [agenda.id], turn.day), now);
  const mio = dia.estimate.turns.get(turn.id);
  const atendiendo = dia.turns.find((t) => t.status === "in_service");
  return {
    organizationId: turn.organizationId,
    agendaId: agenda.id,
    negocio: fila.negocio,
    agenda: agenda.name,
    room: agenda.room,
    timezone: tz,
    code: codigo(agenda.numberPrefix, turn.number),
    status: turn.status,
    scheduledAt: turn.scheduledAt?.toISOString() ?? null,
    peopleBefore: mio?.peopleBefore ?? 0,
    estimatedAt: mio?.estimatedAt.toISOString() ?? null,
    delayMinutes: turn.scheduledAt ? Math.round(dia.estimate.delayMinutes) : 0,
    servingCode: atendiendo ? codigo(agenda.numberPrefix, atendiendo.number) : null,
    confirmedAt: turn.confirmedAt?.toISOString() ?? null,
    updatedAt: now.toISOString(),
  };
}

export type VistaPaciente = NonNullable<Awaited<ReturnType<typeof vistaPorToken>>>;

/** Sala de espera: quién pasa y quién sigue. Solo códigos, sin nombres. */
export async function vistaSala(organizationId: string, now = new Date()) {
  const t = await tablero(organizationId, now);
  return {
    agendas: t.agendas.map((d) => ({
      id: d.agenda.id,
      name: d.agenda.name,
      room: d.agenda.room,
      llamado: d.orden.filter((x) => x.status === "called").map((x) => codigo(d.agenda.numberPrefix, x.number)),
      atendiendo: d.orden.filter((x) => x.status === "in_service").map((x) => codigo(d.agenda.numberPrefix, x.number)),
      siguientes: d.orden
        .filter((x) => x.status === "waiting")
        .slice(0, 5)
        .map((x) => codigo(d.agenda.numberPrefix, x.number)),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Escritura                                                            */
/* ------------------------------------------------------------------ */

function violacionUnica(err: unknown): string | null {
  for (let e: unknown = err; typeof e === "object" && e !== null; e = (e as { cause?: unknown }).cause) {
    const x = e as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
    if (x.code === "23505") return String(x.constraint_name ?? x.constraint ?? "");
  }
  return null;
}

export type ErrorAlta = "agenda_inexistente" | "sin_fila" | "cerrada" | "sin_lugar" | "ya_tiene_turno";

export type Alta =
  | { ok: true; turn: TurnRow; code: string; link: string; peopleBefore: number; estimatedAt: Date | null }
  | { ok: false; error: ErrorAlta; message: string; turn?: TurnRow };

/**
 * Sumar a alguien a la fila de hoy. En `queue` toma el próximo número; en
 * `gaps`, además, el próximo hueco libre del día. Una persona (contacto) tiene
 * a lo sumo un turno activo por agenda por día: lo garantiza un índice único.
 */
export async function sumarTurno(input: {
  organizationId: string;
  agendaId: string;
  displayName: string;
  source: "whatsapp" | "reception" | "booking";
  actor: Actor;
  contactId?: string | null;
  conversationId?: string | null;
  bookingId?: string | null;
  scheduledAt?: Date | null;
  userId?: string | null;
  now?: Date;
}): Promise<Alta> {
  const now = input.now ?? new Date();
  const agenda = await agendaPropia(input.organizationId, input.agendaId);
  if (!agenda || !agenda.active) {
    return { ok: false, error: "agenda_inexistente", message: "Esa agenda no existe." };
  }
  const tz = await businessTimezone(input.organizationId);
  const day = hoyEn(tz, now);
  const esCita = input.source === "booking";
  if (!esCita && agenda.walkInMode === "none") {
    return { ok: false, error: "sin_fila", message: `${agenda.name} atiende solo con cita.` };
  }
  const cierra = zonedWallClockToUtc(day, agenda.closesAt, tz);
  if (!esCita && cierra && now >= cierra) {
    return { ok: false, error: "cerrada", message: `${agenda.name} ya cerró por hoy.` };
  }

  const db = getDb();
  if (input.contactId) {
    const ya = await turnoActivoDe(input.organizationId, input.contactId, agenda.id, day);
    if (ya) {
      return { ok: false, error: "ya_tiene_turno", message: "Ya tenés un turno hoy en esta agenda.", turn: ya };
    }
  }

  // ponytail: reintento sobre la clave (agenda, día, número); dos altas en
  // carrera por el mismo hueco en `gaps` pueden compartirlo — si importa,
  // una restricción de exclusión sobre el intervalo.
  for (let intento = 0; intento < 3; intento++) {
    const turns = await turnosDelDia(input.organizationId, [agenda.id], day);
    let scheduledAt = input.scheduledAt ?? null;
    if (!esCita && agenda.walkInMode === "gaps") {
      const abre = zonedWallClockToUtc(day, agenda.opensAt, tz);
      const ocupados = turns
        .filter((t) => t.scheduledAt && ACTIVOS.includes(t.status))
        .map((t) => t.scheduledAt!);
      scheduledAt = abre && cierra ? nextFreeSlot(ocupados, agenda.slotMinutes, abre, cierra, now) : null;
      if (!scheduledAt) {
        return { ok: false, error: "sin_lugar", message: `No quedan horarios libres hoy en ${agenda.name}.` };
      }
    }
    const id = newId("turn");
    const number = Math.max(0, ...turns.map((t) => t.number)) + 1;
    try {
      const [turn] = await db
        .insert(schema.turn)
        .values({
          id,
          organizationId: input.organizationId,
          agendaId: agenda.id,
          day,
          number,
          displayName: input.displayName.trim() || "Paciente",
          scheduledAt,
          tokenHash: hashToken(tokenDe(id)),
          source: input.source,
          contactId: input.contactId ?? null,
          conversationId: input.conversationId ?? null,
          bookingId: input.bookingId ?? null,
          joinedAt: now,
          statusChangedBy: input.actor,
          statusChangedAt: now,
        })
        .returning();
      await db.insert(schema.turnEvent).values({
        id: newId("turnEvent"),
        organizationId: input.organizationId,
        turnId: id,
        toStatus: "waiting",
        actor: input.actor,
        userId: input.userId ?? null,
      });
      const dia = armarDia(agenda, [...turns, turn!], now);
      const est = dia.estimate.turns.get(id);
      // Si ya entra dentro del «ya casi», ese aviso cuenta como dicho: quien
      // lo sumó (el agente o recepción) le acaba de dar estos mismos números,
      // y un «¿Estás viniendo?» en el mismo instante llegaba antes que esa
      // respuesta.
      if (est && est.peopleBefore <= agenda.notifyBefore) {
        await db
          .insert(schema.turnNotice)
          .values({ id: newId("turnNotice"), organizationId: input.organizationId, turnId: id, kind: "pronto", status: "sent", error: "al_sumarse" })
          .onConflictDoNothing();
      }
      despuesDelCambio(input.organizationId, agenda.id);
      return {
        ok: true,
        turn: turn!,
        code: codigo(agenda.numberPrefix, number),
        link: linkDelTurno(id),
        peopleBefore: est?.peopleBefore ?? 0,
        estimatedAt: est?.estimatedAt ?? null,
      };
    } catch (err) {
      const restriccion = violacionUnica(err);
      if (restriccion === "turn_contact_activo_uq") {
        const ya = await turnoActivoDe(input.organizationId, input.contactId!, agenda.id, day);
        return { ok: false, error: "ya_tiene_turno", message: "Ya tenés un turno hoy en esta agenda.", turn: ya ?? undefined };
      }
      if (restriccion === "turn_booking_uq") {
        return { ok: false, error: "ya_tiene_turno", message: "Esa cita ya está en la fila." };
      }
      if (restriccion === null) throw err;
    }
  }
  throw new Error("No se pudo asignar un número de turno");
}

async function turnoActivoDe(organizationId: string, contactId: string, agendaId: string, day: string) {
  const rows = await getDb()
    .select()
    .from(schema.turn)
    .where(
      scoped(
        schema.turn.organizationId,
        organizationId,
        eq(schema.turn.contactId, contactId),
        eq(schema.turn.agendaId, agendaId),
        eq(schema.turn.day, day),
        inArray(schema.turn.status, ACTIVOS)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export type Resultado = { ok: true } | { ok: false; message: string };

/**
 * Un cambio de estado idempotente: `update … where status = esperado`. Si otro
 * accionó primero, se devuelve quién y cuándo («Lo terminó recepción a las
 * 16:45») en vez de un error.
 */
export async function transicionar(input: {
  organizationId: string;
  turnId: string;
  expected: TurnStatus;
  to: TurnStatus;
  actor: Actor;
  userId?: string | null;
  now?: Date;
  /** false: sin avisos por WhatsApp (cerrar el día no es «ya casi» para nadie). */
  avisar?: boolean;
}): Promise<Resultado> {
  const now = input.now ?? new Date();
  const plan = planTransition(
    { status: input.expected, statusChangedBy: null, statusChangedAt: null },
    input.expected,
    input.to,
    input.actor,
    now
  );
  if (plan.kind !== "ok") return { ok: false, message: "Esa acción no está permitida para este turno." };
  const { patch } = plan;
  const db = getDb();
  const updated = await db
    .update(schema.turn)
    .set({
      status: patch.status,
      statusChangedBy: patch.statusChangedBy,
      statusChangedAt: patch.statusChangedAt,
      ...(patch.calledAt && { calledAt: patch.calledAt }),
      ...(patch.startedAt && { startedAt: patch.startedAt }),
      ...(patch.finishedAt && { finishedAt: patch.finishedAt }),
    })
    .where(
      scoped(
        schema.turn.organizationId,
        input.organizationId,
        eq(schema.turn.id, input.turnId),
        eq(schema.turn.status, input.expected)
      )
    )
    .returning({ agendaId: schema.turn.agendaId, bookingId: schema.turn.bookingId });

  if (updated.length === 0) {
    const rows = await db
      .select({
        status: schema.turn.status,
        by: schema.turn.statusChangedBy,
        at: schema.turn.statusChangedAt,
      })
      .from(schema.turn)
      .where(scoped(schema.turn.organizationId, input.organizationId, eq(schema.turn.id, input.turnId)))
      .limit(1);
    const actual = rows[0];
    if (!actual) return { ok: false, message: "No encontramos ese turno." };
    const tz = await businessTimezone(input.organizationId);
    return {
      ok: false,
      message: staleMessage(
        { status: actual.status, statusChangedBy: actual.by, statusChangedAt: actual.at },
        (d) => horaLocal(d, tz)
      ),
    };
  }

  await db.insert(schema.turnEvent).values({
    id: newId("turnEvent"),
    organizationId: input.organizationId,
    turnId: input.turnId,
    fromStatus: input.expected,
    toStatus: input.to,
    actor: input.actor,
    userId: input.userId ?? null,
  });

  // La cita de la agenda de Citas sigue a su turno: atendida o ausente.
  const { agendaId, bookingId } = updated[0]!;
  if (bookingId && (input.to === "finished" || input.to === "absent")) {
    await markBookingStatus({
      organizationId: input.organizationId,
      bookingId,
      status: input.to === "finished" ? "realizada" : "no_show",
    }).catch((err) => console.error("[turnos] no se pudo marcar la cita:", err));
  }
  if (input.avisar === false) publish(input.organizationId, { type: "turno.changed", data: { agendaId } });
  else despuesDelCambio(input.organizationId, agendaId);
  return { ok: true };
}

/** «Sí, voy»: queda confirmado; el aviso «ya casi» ya no pregunta. */
export async function confirmarQueViene(organizationId: string, turnId: string): Promise<Resultado> {
  const rows = await getDb()
    .update(schema.turn)
    .set({ confirmedAt: new Date() })
    .where(
      scoped(
        schema.turn.organizationId,
        organizationId,
        eq(schema.turn.id, turnId),
        inArray(schema.turn.status, ["waiting", "called"]),
        isNull(schema.turn.confirmedAt)
      )
    )
    .returning({ agendaId: schema.turn.agendaId });
  if (rows[0]) despuesDelCambio(organizationId, rows[0].agendaId);
  return { ok: true };
}

/** Cerrar el día: quien sigue esperando (o llamado) pasa a ausente. */
export async function cerrarDia(input: { organizationId: string; agendaId: string; userId?: string | null }) {
  const tz = await businessTimezone(input.organizationId);
  const day = hoyEn(tz);
  const turns = await turnosDelDia(input.organizationId, [input.agendaId], day);
  let cerrados = 0;
  for (const t of turns.filter((x) => x.status === "waiting" || x.status === "called")) {
    // De `called` no se pasa directo a ausente: primero vuelve a la fila.
    if (t.status === "called") {
      await transicionar({ ...input, turnId: t.id, expected: "called", to: "waiting", actor: "reception", avisar: false });
    }
    const r = await transicionar({
      ...input,
      turnId: t.id,
      expected: "waiting",
      to: "absent",
      actor: "reception",
      avisar: false,
    });
    if (r.ok) cerrados++;
  }
  return { cerrados };
}

/* ------------------------------------------------------------------ */
/* Agendas (configuración)                                              */
/* ------------------------------------------------------------------ */

export type AgendaInput = {
  name: string;
  room?: string;
  walkInMode: "queue" | "gaps" | "none";
  slotMinutes: number;
  opensAt: string;
  closesAt: string;
  numberPrefix: string;
  notifyBefore?: number;
  receivesBookings?: boolean;
  active?: boolean;
};

export async function guardarAgenda(
  organizationId: string,
  data: AgendaInput,
  agendaId?: string
): Promise<{ ok: true; agenda: AgendaRow } | { ok: false; message: string }> {
  const db = getDb();
  try {
    // Una sola agenda recibe las citas: marcar una desmarca las demás.
    if (data.receivesBookings) {
      await db
        .update(schema.queueAgenda)
        .set({ receivesBookings: false })
        .where(scoped(schema.queueAgenda.organizationId, organizationId));
    }
    if (agendaId) {
      const [agenda] = await db
        .update(schema.queueAgenda)
        .set({ ...data, updatedAt: new Date() })
        .where(scoped(schema.queueAgenda.organizationId, organizationId, eq(schema.queueAgenda.id, agendaId)))
        .returning();
      if (!agenda) return { ok: false, message: "Esa agenda no existe." };
      despuesDelCambio(organizationId, agenda.id);
      return { ok: true, agenda };
    }
    const [agenda] = await db
      .insert(schema.queueAgenda)
      .values({ id: newId("queueAgenda"), organizationId, ...data })
      .returning();
    despuesDelCambio(organizationId, agenda!.id);
    return { ok: true, agenda: agenda! };
  } catch (err) {
    if (violacionUnica(err) === "queue_agenda_org_prefix_uq") {
      return { ok: false, message: `Ya hay una agenda con la letra ${data.numberPrefix}.` };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Citas del día → fila                                                 */
/* ------------------------------------------------------------------ */

/**
 * Las citas de hoy (agenda de Citas, `AGENDA`) entran a la fila marcada
 * «recibe citas» como turnos con horario, para que también tengan estado en
 * vivo y avisos. Idempotente: el índice único sobre `booking_id` impide que
 * una cita entre dos veces. Una cita cancelada saca a su turno de la fila.
 *
 * ponytail: se hace al leer (tablero, bot, avisador), no con un reloj; una
 * cita creada hoy aparece en la fila al primer vistazo de alguien.
 */
export async function traerCitasDeHoy(organizationId: string, tz: string, day: string, now = new Date()) {
  const db = getDb();
  const [destino] = await db
    .select()
    .from(schema.queueAgenda)
    .where(
      scoped(
        schema.queueAgenda.organizationId,
        organizationId,
        eq(schema.queueAgenda.receivesBookings, true),
        eq(schema.queueAgenda.active, true)
      )
    )
    .limit(1);
  if (!destino) return;
  const desde = zonedWallClockToUtc(day, "00:00", tz);
  const hasta = zonedWallClockToUtc(addDaysISO(day, 1), "00:00", tz);
  if (!desde || !hasta) return;

  const citas = await db
    .select({ booking: schema.booking, contacto: schema.contact.name, turnId: schema.turn.id, turnStatus: schema.turn.status })
    .from(schema.booking)
    .leftJoin(schema.contact, eq(schema.contact.id, schema.booking.contactId))
    .leftJoin(schema.turn, eq(schema.turn.bookingId, schema.booking.id))
    .where(
      scoped(
        schema.booking.organizationId,
        organizationId,
        eq(schema.booking.kind, "session"),
        eq(schema.booking.isTest, false),
        gte(schema.booking.scheduledAt, desde),
        lt(schema.booking.scheduledAt, hasta)
      )
    );

  for (const c of citas) {
    if (c.turnId && c.booking.status === "cancelada" && c.turnStatus === "waiting") {
      await transicionar({ organizationId, turnId: c.turnId, expected: "waiting", to: "cancelled", actor: "system" });
      continue;
    }
    if (c.turnId || c.booking.status !== "agendada") continue;
    const conversationId = c.booking.conversationId ?? (await ultimaConversacion(organizationId, c.booking.contactId));
    await sumarTurno({
      organizationId,
      agendaId: destino.id,
      displayName: c.contacto ?? "Paciente",
      source: "booking",
      actor: "system",
      contactId: c.booking.contactId,
      conversationId,
      bookingId: c.booking.id,
      scheduledAt: c.booking.scheduledAt,
      now,
    }).catch((err) => console.error("[turnos] no se pudo traer la cita:", err));
  }
}

async function ultimaConversacion(organizationId: string, contactId: string | null): Promise<string | null> {
  if (!contactId) return null;
  const rows = await getDb()
    .select({ id: schema.conversation.id })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false)
      )
    )
    .orderBy(desc(schema.conversation.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Avisos                                                               */
/* ------------------------------------------------------------------ */

function despuesDelCambio(organizationId: string, agendaId: string) {
  publish(organizationId, { type: "turno.changed", data: { agendaId } });
  void avisar(organizationId, agendaId).catch((err) =>
    console.error("[turnos] el avisador falló:", err)
  );
}

/**
 * Manda por WhatsApp lo que le toca a cada turno de la agenda (ver
 * `avisosPendientes`). Primero RESERVA el aviso en `turn_notice` (clave única
 * turno+tipo) y después lo manda: dos cambios casi simultáneos no avisan dos
 * veces. Si el envío falla (ventana cerrada, sin número), el turno queda
 * «sin aviso» y recepción lo ve; la reserva se libera para reintentar en el
 * próximo cambio (la ventana puede reabrirse si el paciente escribe).
 *
 * Los avisos salen marcados como del asistente (`aiGenerated`): un aviso
 * automático no «contesta» lo que el paciente haya escrito (025).
 */
export async function avisar(organizationId: string, agendaId: string, now = new Date()) {
  const agenda = await agendaPropia(organizationId, agendaId);
  if (!agenda) return;
  const tz = await businessTimezone(organizationId);
  const turns = await turnosDelDia(organizationId, [agendaId], hoyEn(tz, now));
  if (turns.length === 0) return;
  const db = getDb();
  const ya = await db
    .select({ turnId: schema.turnNotice.turnId, kind: schema.turnNotice.kind })
    .from(schema.turnNotice)
    .where(
      scoped(schema.turnNotice.organizationId, organizationId, inArray(schema.turnNotice.turnId, turns.map((t) => t.id)))
    );
  const [org] = await db
    .select({ name: schema.organization.name })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);

  const avisos = avisosPendientes({
    negocio: org?.name ?? "",
    agenda,
    turns,
    estimate: estimateAgenda(turns.map(paraEstimar), agenda.slotMinutes, now),
    timezone: tz,
    yaAvisados: new Set(ya.map((n) => `${n.turnId}|${n.kind}`)),
    linkDe: linkDelTurno,
  });

  for (const a of avisos) {
    const reservado = await db
      .insert(schema.turnNotice)
      .values({ id: newId("turnNotice"), organizationId, turnId: a.turnId, kind: a.kind, status: "sent" })
      .onConflictDoNothing()
      .returning({ id: schema.turnNotice.id });
    if (reservado.length === 0) continue;
    try {
      const base = { organizationId, conversationId: a.conversationId, text: a.text, aiGenerated: true };
      await (a.buttons ? sendButtons({ ...base, buttons: a.buttons }) : sendText(base));
      await db
        .update(schema.turn)
        .set({ noticeFailed: false })
        .where(scoped(schema.turn.organizationId, organizationId, eq(schema.turn.id, a.turnId), eq(schema.turn.noticeFailed, true)));
    } catch (err) {
      const motivo = err instanceof SendError ? err.code : "error";
      console.warn(`[turnos] aviso ${a.kind} sin enviar (${motivo})`);
      await db.delete(schema.turnNotice).where(eq(schema.turnNotice.id, reservado[0]!.id));
      await db
        .update(schema.turn)
        .set({ noticeFailed: true })
        .where(scoped(schema.turn.organizationId, organizationId, eq(schema.turn.id, a.turnId)));
      publish(organizationId, { type: "turno.changed", data: { agendaId } });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Para el cerebro (/api/bot/turnos)                                    */
/* ------------------------------------------------------------------ */

/** Las agendas con su espera ahora, y los turnos de hoy de este contacto. */
export async function estadoParaContacto(organizationId: string, contactId: string, now = new Date()) {
  const t = await tablero(organizationId, now);
  const agendas = t.agendas.map((d) => {
    const enEspera = d.orden.filter((x) => x.status !== "in_service").length;
    const ultimo = [...d.estimate.turns.values()].at(-1);
    const espera = ultimo
      ? Math.max(0, (ultimo.estimatedAt.getTime() - now.getTime()) / 60_000 + d.estimate.averageMinutes)
      : 0;
    return {
      id: d.agenda.id,
      name: d.agenda.name,
      walkIn: d.agenda.walkInMode !== "none",
      peopleWaiting: enEspera,
      waitMinutes: Math.round(espera),
      opensAt: d.agenda.opensAt,
      closesAt: d.agenda.closesAt,
    };
  });
  const turnos = t.agendas.flatMap((d) =>
    d.turns
      .filter((x) => x.contactId === contactId && ACTIVOS.includes(x.status))
      .map((x) => {
        const est = d.estimate.turns.get(x.id);
        return {
          id: x.id,
          agendaId: d.agenda.id,
          agenda: d.agenda.name,
          room: d.agenda.room,
          code: codigo(d.agenda.numberPrefix, x.number),
          status: x.status,
          scheduledAt: x.scheduledAt ? horaLocal(x.scheduledAt, t.timezone) : null,
          peopleBefore: est?.peopleBefore ?? 0,
          estimatedAt: est ? horaLocal(est.estimatedAt, t.timezone) : null,
          confirmed: x.confirmedAt !== null,
          link: linkDelTurno(x.id),
        };
      })
  );
  return { timezone: t.timezone, now: horaLocal(now, t.timezone), agendas, turnos };
}

/** Un turno de hoy de ESTE contacto, o null: el cerebro solo toca los suyos. */
export async function turnoDelContacto(organizationId: string, contactId: string, turnId: string) {
  const rows = await getDb()
    .select()
    .from(schema.turn)
    .where(
      scoped(schema.turn.organizationId, organizationId, eq(schema.turn.id, turnId), eq(schema.turn.contactId, contactId))
    )
    .limit(1);
  return rows[0] ?? null;
}

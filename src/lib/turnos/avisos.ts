// Qué avisos por WhatsApp le tocan a cada turno AHORA. Pura: recibe el estado
// del día y lo ya avisado, devuelve lo que falta. Se puede llamar en cada
// cambio sin miedo: lo que ya salió no vuelve a salir (la clave (turno, tipo)
// es única en `turn_notice`).
//
// Los textos no llevan el nombre del negocio delante ni links: el número de
// WhatsApp ya es el del negocio (una instalación por negocio).

import { roundToFive, type AgendaEstimate } from "./estimate";
import { codigo, fechaLocal, horaLocal } from "./format";
import type { TurnStatus } from "./transitions";

/** Demora que dispara un aviso, y cada cuánto se repite si sigue creciendo. */
export const UMBRAL_DEMORA_MIN = 15;

export type AvisoTurno = {
  id: string;
  number: number;
  status: TurnStatus;
  scheduledAt: Date | null;
  calledAt: Date | null;
  confirmedAt: Date | null;
  /** `booking`: vino de la agenda de Citas. Lo demás con horario es reserva. */
  source?: "whatsapp" | "reception" | "booking";
  /** Sin conversación de WhatsApp no hay a quién avisar. */
  conversationId: string | null;
};

export type AvisoAgenda = {
  name: string;
  room: string;
  numberPrefix: string;
  notifyBefore: number;
};

export type Boton = { id: string; title: string };

export type Aviso = {
  turnId: string;
  conversationId: string;
  kind: string;
  text: string;
  buttons?: Boton[];
};

/** Ids de los botones de «¿Estás viniendo?»: el ingest los reconoce. */
export const BOTON_SI = "turno:si:";
export const BOTON_NO = "turno:no:";

const CIERRE = "Te aviso por acá cuando falte poco y cuando sea tu turno.";

export function avisosPendientes(input: {
  agenda: AvisoAgenda;
  turns: AvisoTurno[];
  estimate: AgendaEstimate;
  timezone: string;
  /** `${turnId}|${kind}` de lo ya avisado. */
  yaAvisados: Set<string>;
  /**
   * false: los turnos son de otro día (una reserva a futuro). Solo sale la
   * bienvenida; «ya casi», el llamado y la demora, ese día.
   */
  esHoy?: boolean;
  /**
   * Conversaciones donde ya se viene hablando (mensajes recientes): ahí la
   * bienvenida no saluda de nuevo.
   */
  charlando?: Set<string>;
}): Aviso[] {
  const { agenda, estimate, timezone, yaAvisados } = input;
  const esHoy = input.esHoy ?? true;
  const out: Aviso[] = [];
  const push = (t: AvisoTurno, a: Omit<Aviso, "turnId" | "conversationId">) => {
    if (!t.conversationId || yaAvisados.has(`${t.id}|${a.kind}`)) return;
    out.push({ turnId: t.id, conversationId: t.conversationId, ...a });
  };

  for (const t of input.turns) {
    const code = codigo(agenda.numberPrefix, t.number);

    if (t.status === "called" && t.calledAt) {
      // La clave lleva el instante del llamado: si no se presentó y se lo
      // vuelve a llamar, el aviso sale de nuevo.
      const lugar = agenda.room ? `Pasá a ${agenda.room}.` : "Acercate a recepción.";
      push(t, {
        kind: `llamado:${t.calledAt.getTime()}`,
        text: `¡Es tu turno! ${code}, ${agenda.name}. ${lugar}`,
      });
      continue;
    }
    if (t.status !== "waiting") continue;

    const est = estimate.turns.get(t.id);
    const hora = est ? horaLocal(roundToFive(est.estimatedAt), timezone) : null;

    // Bienvenida: el primer mensaje del CRM sobre este turno se presenta con
    // lo que el paciente necesita. Sin ella, lo primero que podía recibir era
    // un «ya casi» suelto. En esa misma pasada no sale nada más.
    if (!yaAvisados.has(`${t.id}|alta`) && t.conversationId) {
      push(t, {
        kind: "alta",
        text: bienvenida(t, code, agenda.name, timezone, esHoy, est?.peopleBefore, hora, !input.charlando?.has(t.conversationId)),
      });
      continue;
    }
    if (!esHoy || !est || !hora) continue;

    if (est.peopleBefore <= agenda.notifyBefore) {
      const antes =
        est.peopleBefore === 0
          ? "sos el próximo"
          : est.peopleBefore === 1
            ? "falta 1 persona"
            : `faltan ${est.peopleBefore} personas`;
      push(t, {
        kind: "pronto",
        text: t.confirmedAt
          ? `Ya casi: ${antes} para tu turno ${code} (≈ ${hora}).`
          : `Ya casi: ${antes} para tu turno ${code} (≈ ${hora}). ¿Estás viniendo?`,
        buttons: t.confirmedAt
          ? undefined
          : [
              { id: `${BOTON_SI}${t.id}`, title: "Sí, voy" },
              { id: `${BOTON_NO}${t.id}`, title: "No voy a poder" },
            ],
      });
    }

    // Demora: solo con horario (reserva o cita), contra ese horario. Un aviso
    // por tramo de UMBRAL_DEMORA_MIN; si la demora baja, no se avisa.
    if (t.scheduledAt) {
      const demora = (est.estimatedAt.getTime() - t.scheduledAt.getTime()) / 60_000;
      const tramo = Math.floor(demora / UMBRAL_DEMORA_MIN);
      if (tramo >= 1) {
        push(t, {
          kind: `demora:${tramo}`,
          text: `Hay demora en ${agenda.name}: tu turno de las ${horaLocal(t.scheduledAt, timezone)} pasaría a ≈ ${hora}.`,
        });
      }
    }
  }
  return out;
}

function bienvenida(
  t: AvisoTurno,
  code: string,
  agenda: string,
  tz: string,
  esHoy: boolean,
  peopleBefore: number | undefined,
  hora: string | null,
  saludar = true
): string {
  const hola = saludar ? "¡Hola! " : "";
  const cuando =
    peopleBefore === undefined || hora === null
      ? ""
      : peopleBefore === 0
        ? ` Sos el próximo (≈ ${hora}).`
        : ` ${peopleBefore === 1 ? "Hay 1 persona" : `Hay ${peopleBefore} personas`} antes que vos (te atienden ≈ ${hora}).`;
  if (!t.scheduledAt) {
    return `${hola}Te anoté en la fila de hoy de ${agenda}. Tu número es el ${code}.${cuando}\n${CIERRE}`;
  }
  const hh = horaLocal(t.scheduledAt, tz);
  if (t.source === "booking") {
    return `${hola}Tu cita de hoy a las ${hh} (${agenda}) ya está en la fila. Tu número es el ${code}.${cuando}\n${CIERRE}`;
  }
  if (!esHoy) {
    return `${hola}Te reservé el turno del ${fechaLocal(t.scheduledAt, tz)} a las ${hh} (${agenda}). Ese día te aviso por acá cuando falte poco y cuando sea tu turno.`;
  }
  return `${hola}Te reservé el turno de hoy a las ${hh} (${agenda}). Tu número es el ${code}.${cuando}\n${CIERRE}`;
}

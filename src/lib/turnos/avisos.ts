// Qué avisos por WhatsApp le tocan a cada turno AHORA. Pura: recibe el estado
// del día y lo ya avisado, devuelve lo que falta. Se puede llamar en cada
// cambio sin miedo: lo que ya salió no vuelve a salir (la clave (turno, tipo)
// es única en `turn_notice`).

import { roundToFive, type AgendaEstimate } from "./estimate";
import { codigo, horaLocal } from "./format";
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

export function avisosPendientes(input: {
  negocio: string;
  agenda: AvisoAgenda;
  turns: AvisoTurno[];
  estimate: AgendaEstimate;
  timezone: string;
  /** `${turnId}|${kind}` de lo ya avisado. */
  yaAvisados: Set<string>;
  /** El link en vivo de cada turno (lo arma el servidor). */
  linkDe?: (turnId: string) => string;
}): Aviso[] {
  const { negocio, agenda, estimate, timezone, yaAvisados } = input;
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
        text: `${negocio}: ¡es tu turno! ${code} en ${agenda.name}. ${lugar}`,
      });
      continue;
    }
    if (t.status !== "waiting") continue;

    const est = estimate.turns.get(t.id);
    if (!est) continue;
    const hora = horaLocal(roundToFive(est.estimatedAt), timezone);

    // Bienvenida: el primer mensaje del CRM sobre este turno se presenta,
    // con todo lo que el paciente necesita. Sin ella, lo primero que podía
    // recibir era un «ya casi» suelto, sin saber de quién ni de qué. En esa
    // misma pasada no sale nada más: sería repetir lo mismo.
    if (!yaAvisados.has(`${t.id}|alta`)) {
      const link = input.linkDe ? `\nSeguilo en vivo: ${input.linkDe(t.id)}` : "";
      const cita = t.scheduledAt
        ? `Tu cita de las ${horaLocal(t.scheduledAt, timezone)} en ${agenda.name} ya está en la fila de hoy, con el número ${code}.`
        : `Te anotamos para hoy en ${agenda.name}. Tu número es el ${code}.`;
      const cuando =
        est.peopleBefore === 0
          ? `Sos el próximo (≈ ${hora}).`
          : `${antesQueVos(est.peopleBefore)} (te atienden ≈ ${hora}).`;
      push(t, {
        kind: "alta",
        text: `${negocio}: ¡hola! ${cita} ${cuando}${link}\nTe aviso por acá cuando falte poco y cuando sea tu turno.`,
      });
      if (t.conversationId) continue;
    }

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
          ? `${negocio}: ya casi, ${antes} para tu turno ${code} (≈ ${hora}).`
          : `${negocio}: ya casi, ${antes} para tu turno ${code} (≈ ${hora}). ¿Estás viniendo?`,
        buttons: t.confirmedAt
          ? undefined
          : [
              { id: `${BOTON_SI}${t.id}`, title: "Sí, voy" },
              { id: `${BOTON_NO}${t.id}`, title: "No voy a poder" },
            ],
      });
    }

    // Demora: solo en citas, contra su horario. Un aviso por tramo de
    // UMBRAL_DEMORA_MIN; si la demora baja, no se avisa (no hay «adelanto»).
    if (t.scheduledAt) {
      const demora = (est.estimatedAt.getTime() - t.scheduledAt.getTime()) / 60_000;
      const tramo = Math.floor(demora / UMBRAL_DEMORA_MIN);
      if (tramo >= 1) {
        push(t, {
          kind: `demora:${tramo}`,
          text: `${negocio}: hay demora en ${agenda.name}. Tu turno de las ${horaLocal(t.scheduledAt, timezone)} pasaría a ≈ ${hora}.`,
        });
      }
    }
  }
  return out;
}

function antesQueVos(n: number): string {
  return n === 1 ? "Hay 1 persona antes que vos" : `Hay ${n} personas antes que vos`;
}

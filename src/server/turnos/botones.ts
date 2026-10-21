import { BOTON_NO, BOTON_SI } from "@/lib/turnos/avisos";
import { codigo } from "@/lib/turnos/format";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sendText } from "@/server/inbox/send";
import { turnosEnabled } from "./flag";
import { confirmarQueViene, transicionar, turnoDelContacto } from "./service";

/**
 * 039 — La respuesta a «¿Estás viniendo?» (botones del aviso «ya casi»). Se
 * resuelve aquí, sin cerebro: es una decisión cerrada y tiene que funcionar
 * aunque el agente esté apagado. Devuelve true si la atendió (la ingesta
 * entonces no despacha al cerebro, que contestaría otra vez); false si el
 * botón no es de turnos o el turno ya no aplica, y sigue el camino de siempre.
 */
export async function atenderBotonDeTurno(input: {
  organizationId: string;
  contactId: string;
  conversationId: string;
  botonId: string;
}): Promise<boolean> {
  if (!turnosEnabled()) return false;
  const si = input.botonId.startsWith(BOTON_SI);
  if (!si && !input.botonId.startsWith(BOTON_NO)) return false;
  const turnId = input.botonId.slice((si ? BOTON_SI : BOTON_NO).length);

  // Solo un turno de ESTE contacto: un id ajeno en un payload armado no sirve.
  const turno = await turnoDelContacto(input.organizationId, input.contactId, turnId);
  if (!turno || !["waiting", "called"].includes(turno.status)) return false;
  const [agenda] = await getDb()
    .select({ prefix: schema.queueAgenda.numberPrefix })
    .from(schema.queueAgenda)
    .where(eq(schema.queueAgenda.id, turno.agendaId))
    .limit(1);
  const code = codigo(agenda?.prefix ?? "", turno.number);

  let texto: string;
  if (si) {
    await confirmarQueViene(input.organizationId, turnId);
    texto = `¡Gracias! Te esperamos. Tu turno es el ${code}; te aviso cuando te toque.`;
  } else {
    const r = await transicionar({
      organizationId: input.organizationId,
      turnId,
      expected: "waiting",
      to: "cancelled",
      actor: "client",
    });
    if (!r.ok) return false;
    texto = `Listo, cancelamos tu turno ${code}. Si querés otro, escribinos.`;
  }
  await sendText({
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    text: texto,
    aiGenerated: true,
  }).catch((err) => console.warn("[turnos] no se pudo confirmar el botón:", err));
  return true;
}

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { TURN_STATUSES } from "@/lib/db/schema";

/** 039 — Validación de lo que entra a la superficie de turnos. */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const agendaSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    room: z.string().trim().max(80).default(""),
    walkInMode: z.enum(["queue", "gaps", "none"]),
    slotMinutes: z.number().int().min(1).max(480),
    opensAt: z.string().regex(HHMM, "HH:MM"),
    closesAt: z.string().regex(HHMM, "HH:MM"),
    numberPrefix: z.string().trim().min(1).max(3).transform((s) => s.toUpperCase()),
    notifyBefore: z.number().int().min(0).max(20).default(2),
    receivesBookings: z.boolean().default(false),
    active: z.boolean().optional(),
  })
  .refine((a) => a.closesAt > a.opensAt, { path: ["closesAt"], message: "Debe ser después de la apertura" });

export const altaRecepcionSchema = z.object({
  agendaId: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
});

export const transicionSchema = z.object({
  expected: z.enum(TURN_STATUSES),
  to: z.enum(TURN_STATUSES),
});

export const altaBotSchema = z.object({
  conversationId: z.string().min(1),
  agendaId: z.string().min(1),
  /** Nombre a mostrar; sin él, el del contacto. */
  name: z.string().trim().max(80).optional(),
});

export const accionBotSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(["cancel", "confirm"]),
});

/** El contacto de una conversación de la instancia, o null. */
export async function contactoDeConversacion(organizationId: string, conversationId: string) {
  const rows = await getDb()
    .select({
      contact: schema.contact,
      isTest: schema.conversation.isTest,
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
    })
    .from(schema.conversation)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.conversation.contactId))
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conversationId)))
    .limit(1);
  return rows[0] ?? null;
}

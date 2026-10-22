import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { OPERARIO } from "@/lib/auth/roles";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { turnosEnabled } from "@/server/turnos/flag";
import { asignarAgendas } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  role: z.enum(["member", OPERARIO]),
  agendaIds: z.array(z.string().min(1)).max(50).default([]),
});

/**
 * 039 — Cambiar a un miembro entre `member` y `operator` y elegir sus agendas
 * (owner only). Al propietario no se lo toca desde aquí.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede cambiar el equipo");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const [m] = await db
    .select({ userId: schema.member.userId, role: schema.member.role })
    .from(schema.member)
    .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.id, id)))
    .limit(1);
  if (!m) return apiError(404, "not_found", "No existe ese miembro");
  if (m.role === "owner") return apiError(409, "conflict", "El propietario no cambia de rol");

  await db
    .update(schema.member)
    .set({ role: body.data.role })
    .where(scoped(schema.member.organizationId, session.organizationId, eq(schema.member.id, id)));
  if (turnosEnabled()) {
    await asignarAgendas(session.organizationId, m.userId, body.data.role === OPERARIO ? (body.data.agendaIds ?? []) : []);
  }
  return Response.json({ ok: true });
});

import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { OPERARIO } from "@/lib/auth/roles";
import { turnosEnabled } from "@/server/turnos/flag";
import { agendasDelOperario, asignarAgendas } from "@/server/turnos/service";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      userId: schema.member.userId,
      role: schema.member.role,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));
  // 039 — Las agendas de cada operario, solo si hay Turnos.
  const asignadas = turnosEnabled() ? await agendasDelOperario(session.organizationId) : {};
  return Response.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      agendaIds: asignadas[m.userId] ?? [],
      name: m.name,
      email: m.email,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  /** 039 — `operator`: el médico, que solo atiende sus agendas de Turnos. */
  role: z.enum(["member", OPERARIO]).default("member"),
  agendaIds: z.array(z.string().min(1)).max(50).default([]),
});

/** Alta de cuenta de equipo (owner only): email + contraseña temporal (FR-061). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede crear cuentas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo crear la cuenta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Ya existe una cuenta con ese correo");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  await db
    .insert(schema.member)
    .values({
      id: newId("member"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: body.data.role ?? "member",
    })
    .onConflictDoNothing();
  if (body.data.role === OPERARIO && turnosEnabled()) {
    await asignarAgendas(session.organizationId, newUserId, body.data.agendaIds ?? []);
  }

  return Response.json({ ok: true }, { status: 201 });
});

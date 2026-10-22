import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { esOperario, operarioPuede, PATH_HEADER } from "@/lib/auth/roles";
import { resolveMembership } from "@/server/auth/on-signup";

export type SessionContext = {
  userId: string;
  organizationId: string;
  role: string;
};

/** Sesión válida pero fuera de lo que su rol puede ver (un operario). */
export class ForbiddenError extends Error {
  constructor(message = "Tu cuenta solo atiende Turnos") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "No autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Sesión + organización activa para route handlers y server components.
 * Lanza UnauthorizedError si no hay sesión u organización.
 */
export async function requireSession(): Promise<SessionContext> {
  const auth = getAuth();
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) throw new UnauthorizedError();
  // La sesión puede crearse antes de que la membresía exista (registro
  // inicial) — la membresía en BD es la fuente de verdad de org + rol.
  const membership = await resolveMembership(session.user.id);
  if (!membership) {
    throw new UnauthorizedError("Sesión sin organización activa");
  }
  // 039 — El operario queda encerrado en Turnos: aquí pasan TODAS las
  // páginas y la API, así que un solo chequeo lo cubre todo.
  if (esOperario(membership.role) && !operarioPuede(h.get(PATH_HEADER))) {
    throw new ForbiddenError();
  }
  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

/** Igual que requireSession pero devuelve null en vez de lanzar. */
export async function getSessionOrNull(): Promise<SessionContext | null> {
  let forbidden = false;
  try {
    return await requireSession();
  } catch (err) {
    forbidden = err instanceof ForbiddenError;
  }
  // Una página fuera de Turnos manda al operario a su pantalla.
  if (forbidden) redirect("/turnos");
  return null;
}

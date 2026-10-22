/**
 * Quién puede CONFIGURAR la instancia: conectar el número, pegar la llave de
 * IA, escribir el agente, encenderlo. En la raíz son dos roles: el `owner`
 * que crea la organización en el primer registro y el `admin` que Better Auth
 * conoce (hoy nadie lo asigna, pero es un rol de configuración y no de
 * operación). Un `member` del equipo atiende la Bandeja: no puede hacer
 * ninguno de los pasos de la guía de inicio, así que no se le enseña.
 *
 * Vive en `lib/` porque lo consultan los dos lados: el menú (cliente) y la
 * redirección de la raíz (servidor).
 */
export function canConfigure(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * 039 — El operario (el médico) atiende SUS agendas de turnos y nada más: no
 * ve la Bandeja, los contactos ni la configuración.
 */
export const OPERARIO = "operator";

export function esOperario(role: string | null | undefined): boolean {
  return role === OPERARIO;
}

/**
 * Qué rutas puede pedir un operario. Sin ruta conocida, nada: si el
 * middleware no marcó la petición, se niega en vez de dejar pasar.
 */
export function operarioPuede(path: string | null | undefined): boolean {
  if (!path) return false;
  return (
    path === "/turnos" ||
    path.startsWith("/turnos/") ||
    path.startsWith("/api/turnos/") ||
    path === "/api/events"
  );
}

/** Cabecera con la ruta pedida; la pone `src/middleware.ts`. */
export const PATH_HEADER = "x-vocero-path";

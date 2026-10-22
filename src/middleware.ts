import { NextResponse, type NextRequest } from "next/server";
import { PATH_HEADER } from "@/lib/auth/roles";

/**
 * Le pasa a la sesión qué ruta se pidió, para que un operario quede encerrado
 * en Turnos también en la navegación del cliente (los layouts no se vuelven a
 * dibujar). Pisa la cabecera siempre: el navegador no la puede inventar.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { subscribe } from "@/server/events/bus";

const HEARTBEAT_MS = 25_000;
const encoder = new TextEncoder();

/**
 * 039 — SSE PÚBLICO de turnos (link del paciente y sala). A diferencia de
 * `/api/events`, no lleva datos: solo un `changed` cuando algo se movió en
 * las agendas que mira, y la página vuelve a pedir SU estado. Así no viaja
 * nada de otros pacientes. Mismos headers anti-buffering y heartbeat.
 */
export function sseDeTurnos(req: Request, organizationId: string, agendaId: string | null): Response {
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup?.();
        }
      };
      send(`: conectado\n\n`);
      const unsubscribe = subscribe(organizationId, (event) => {
        if (event.type !== "turno.changed") return;
        if (agendaId && event.data.agendaId !== agendaId) return;
        send(`event: changed\ndata: {}\n\n`);
      });
      const heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      };
      req.signal.addEventListener("abort", () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

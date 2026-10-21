"use client";

import { useEffect, useRef } from "react";

/**
 * 039 — Escucha el SSE público de turnos (link del paciente o sala) y llama a
 * `refrescar` en cada `changed`. Si el canal se cae, consulta cada 20 s.
 */
export function useCambios(url: string, refrescar: () => void) {
  const ref = useRef(refrescar);
  ref.current = refrescar;
  useEffect(() => {
    const source = new EventSource(url);
    source.addEventListener("changed", () => ref.current());
    // Al reconectar no hay replay: se pide el estado de nuevo.
    source.onopen = () => ref.current();
    const t = setInterval(() => ref.current(), 20_000);
    return () => {
      source.close();
      clearInterval(t);
    };
  }, [url]);
}

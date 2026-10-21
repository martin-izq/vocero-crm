import { describe, expect, it } from "vitest";
import { avisosPendientes, type AvisoTurno } from "@/lib/turnos/avisos";
import { estimateAgenda } from "@/lib/turnos/estimate";

const TZ = "America/Argentina/Buenos_Aires";
const NOW = new Date("2026-10-21T15:00:00-03:00");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);
const agenda = { name: "Clínica general", room: "Consultorio 2", numberPrefix: "A", notifyBefore: 2 };

function turno(n: number, extra: Partial<AvisoTurno> = {}): AvisoTurno & { startedAt: Date | null; finishedAt: Date | null } {
  return {
    id: `t${n}`, number: n, status: "waiting", scheduledAt: null, calledAt: null,
    confirmedAt: null, conversationId: `cv${n}`, startedAt: null, finishedAt: null, ...extra,
  };
}

function avisos(turns: ReturnType<typeof turno>[], ya: string[] = []) {
  return avisosPendientes({
    negocio: "Centro Norte",
    agenda,
    turns,
    estimate: estimateAgenda(turns, 15, NOW),
    timezone: TZ,
    yaAvisados: new Set(ya),
  });
}

describe("avisos de turnos", () => {
  it("«ya casi» con botones a los primeros notifyBefore+1 en espera; nada al resto", () => {
    const a = avisos([1, 2, 3, 4].map((n) => turno(n)));
    expect(a.map((x) => `${x.turnId}:${x.kind}`)).toEqual(["t1:pronto", "t2:pronto", "t3:pronto"]);
    expect(a[0]!.text).toContain("sos el próximo");
    expect(a[2]!.text).toContain("faltan 2 personas");
    expect(a[0]!.buttons?.map((b) => b.id)).toEqual(["turno:si:t1", "turno:no:t1"]);
  });

  it("lo ya avisado no se repite; sin conversación no se avisa", () => {
    const a = avisos([turno(1), turno(2, { conversationId: null })], ["t1|pronto"]);
    expect(a).toEqual([]);
  });

  it("quien confirmó recibe «ya casi» sin pregunta", () => {
    const [a] = avisos([turno(1, { confirmedAt: at(-10) })]);
    expect(a!.buttons).toBeUndefined();
    expect(a!.text).not.toContain("¿Estás viniendo?");
  });

  it("el llamado avisa una vez por llamado, con el consultorio", () => {
    const t = turno(1, { status: "called", calledAt: at(0) });
    const [a] = avisos([t]);
    expect(a!.kind).toBe(`llamado:${at(0).getTime()}`);
    expect(a!.text).toContain("Pasá a Consultorio 2");
    expect(avisos([t], [`t1|${a!.kind}`])).toEqual([]);
    // Vuelto a llamar tras no presentarse: aviso nuevo.
    expect(avisos([{ ...t, calledAt: at(5) }], [`t1|${a!.kind}`])).toHaveLength(1);
  });

  it("demora de una cita: un aviso por tramo de 15 minutos", () => {
    // Cita a las 15:00, pero hay 3 delante en fila: estimado ≈ 15:45.
    const cita = turno(9, { scheduledAt: at(0) });
    const turns = [turno(1, { scheduledAt: at(-30) }), turno(2, { scheduledAt: at(-20) }), turno(3, { scheduledAt: at(-10) }), cita];
    const kinds = avisos(turns).filter((x) => x.turnId === "t9").map((x) => x.kind);
    expect(kinds).toEqual(["demora:3"]);
  });
});

import { describe, expect, it } from "vitest";
import { aMinutos, falta, franjaVisible, huecosDelDia } from "@/lib/turnos/calendario";

describe("039 — rejilla de la Agenda", () => {
  it("muestra del primer horario que abre al último que cierra, en horas enteras", () => {
    expect(franjaVisible([{ opensAt: "09:30", closesAt: "18:00" }, { opensAt: "08:00", closesAt: "20:15" }])).toEqual({
      startMin: 480,
      endMin: 1260,
    });
    expect(franjaVisible([{ opensAt: "00:00", closesAt: "23:59" }])).toEqual({ startMin: 0, endMin: 1440 });
    expect(franjaVisible([{ opensAt: "09:00", closesAt: "12:00" }], [{ startMin: 780, endMin: 800 }]).endMin).toBe(840);
    expect(aMinutos("23:59")).toBe(1440);
  });

  it("los huecos libres saltan lo ocupado y lo que ya pasó", () => {
    const agenda = { opensAt: "09:00", closesAt: "11:00", slotMinutes: 30 };
    const libres = huecosDelDia(agenda, [{ startMin: 570, endMin: 600 }], 545).map((h) => h.startMin);
    expect(libres).toEqual([600, 630]);
    expect(huecosDelDia(agenda, [{ startMin: 555, endMin: 575 }]).map((h) => h.startMin)).toEqual([600, 630]);
  });

  it("dice cuánto falta", () => {
    expect(falta(20_000)).toBe("ahora");
    expect(falta(25 * 60_000)).toBe("en 25 min");
    expect(falta(80 * 60_000)).toBe("en 1 h 20 min");
    expect(falta(-120 * 60_000)).toBe("hace 2 h");
  });
});

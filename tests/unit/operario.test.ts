import { describe, expect, it } from "vitest";
import { canConfigure, esOperario, operarioPuede } from "@/lib/auth/roles";
import { appNavGroups } from "@/lib/nav";

describe("039 — rol operario", () => {
  it("solo puede pedir Turnos, su API y el SSE", () => {
    for (const p of ["/turnos", "/api/turnos/board", "/api/turnos/turns/tn_1", "/api/events"]) {
      expect(operarioPuede(p)).toBe(true);
    }
    for (const p of ["/inbox", "/", "/settings/team", "/api/conversations", "/api/turnosx", "/turnosx", null, ""]) {
      expect(operarioPuede(p)).toBe(false);
    }
  });

  it("no configura", () => {
    expect(esOperario("operator")).toBe(true);
    expect(canConfigure("operator")).toBe(false);
  });

  it("Agendas aparece detrás de Turnos solo para quien configura", () => {
    const items = (role: string) => appNavGroups({ turnos: true, role })[0]!.items.map((x) => x.href);
    expect(items("owner").slice(-2)).toEqual(["/turnos", "/agendas"]);
    expect(items("member")).not.toContain("/agendas");
    expect(appNavGroups({ turnos: false, role: "owner" })[0]!.items.map((x) => x.href)).not.toContain("/agendas");
  });

  it("el menú del operario es solo Turnos", () => {
    const groups = appNavGroups({ agenda: true, turnos: true, role: "operator" });
    expect(groups.flatMap((g) => g.items.map((i) => i.href))).toEqual(["/turnos"]);
    expect(appNavGroups({ turnos: false, role: "operator" })).toEqual([]);
  });
});

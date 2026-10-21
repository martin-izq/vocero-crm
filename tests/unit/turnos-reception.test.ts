import { expect, test } from "vitest";
import { mainAction } from "@/lib/turnos/reception";

test("call the next one when nobody is in progress", () => {
  expect(mainAction([{ id: "a", status: "finished" }, { id: "b", status: "waiting" }])).toEqual({
    label: "Llamar al siguiente",
    steps: [{ turnId: "b", expected: "waiting", to: "called" }],
  });
});

test("start the called turn", () => {
  expect(mainAction([{ id: "a", status: "called" }, { id: "b", status: "waiting" }])?.label).toBe("Comenzar turno");
});

test("finish and call next in one click", () => {
  const action = mainAction([{ id: "a", status: "in_service" }, { id: "b", status: "waiting" }]);
  expect(action?.label).toBe("Terminar y llamar al siguiente");
  expect(action?.steps).toHaveLength(2);
});

test("only finish when someone is already called or nobody waits", () => {
  expect(mainAction([{ id: "a", status: "in_service" }, { id: "b", status: "called" }])?.label).toBe("Terminar turno");
  expect(mainAction([{ id: "a", status: "in_service" }])?.label).toBe("Terminar turno");
});

test("nothing to do", () => {
  expect(mainAction([{ id: "a", status: "finished" }])).toBeNull();
});

import { describe, it, expect } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

function routineOf(...steps: Step[]): Routine {
  return {
    id: "r",
    name: "R",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

const calc = (a: string, operator: "+" | "-" | "*" | "/", b: string, id = "s1"): Step => ({
  id,
  type: "calculate",
  a,
  operator,
  b
});

describe("calculate", () => {
  it("adds", async () => {
    expect(await runRoutine(routineOf(calc("2", "+", "3")))).toEqual(["2 + 3 = 5"]);
  });

  it("subtracts, allowing a negative result", async () => {
    expect(await runRoutine(routineOf(calc("2", "-", "5")))).toEqual(["2 - 5 = -3"]);
  });

  it("multiplies", async () => {
    expect(await runRoutine(routineOf(calc("4", "*", "2.5")))).toEqual(["4 * 2.5 = 10"]);
  });

  it("divides", async () => {
    expect(await runRoutine(routineOf(calc("9", "/", "3")))).toEqual(["9 / 3 = 3"]);
  });

  it("resolves $vars on either side", async () => {
    const routine = routineOf(
      { id: "s1", type: "saveValue", value: "7", saveAs: "count" },
      calc("$count", "+", "1", "s2")
    );
    const notes = await runRoutine(routine);
    expect(notes[1]).toBe("7 + 1 = 8");
  });

  it("chains: feeds one Calculate's result into the next", async () => {
    const routine = routineOf(
      calc("2", "+", "3", "s1"), // -> $value = 5
      calc("$value", "*", "10", "s2")
    );
    const notes = await runRoutine(routine);
    expect(notes[1]).toBe("5 * 10 = 50");
  });

  it("fails on division by zero", async () => {
    const err = await runRoutine(routineOf(calc("1", "/", "0"))).catch((e) => e);
    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe("division by zero");
  });

  it("fails when a side does not resolve to a number", async () => {
    const err = await runRoutine(routineOf(calc("abc", "+", "1"))).catch((e) => e);
    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('"abc" is not a number (left side)');
  });

  it("fails when a side is blank", async () => {
    const err = await runRoutine(routineOf(calc("1", "+", ""))).catch((e) => e);
    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('"" is not a number (right side)');
  });
});

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

const addTime = (
  base: string,
  amount: number,
  unit: "seconds" | "minutes" | "hours" | "days",
  id = "s1"
): Step => ({ id, type: "addTime", base, amount, unit });

describe("addTime", () => {
  it("shifts a fixed date forward by minutes", async () => {
    const routine = routineOf(addTime("2026-11-13T12:00:00.000Z", 15, "minutes", "s1"));
    const notes = await runRoutine(routine);

    expect(notes).toEqual(['2026-11-13T12:00:00.000Z +15 minutes → 2026-11-13T12:15:00.000Z']);
  });

  it("shifts backward with a negative amount", async () => {
    const routine = routineOf(addTime("2026-11-13T12:00:00.000Z", -7, "days", "s1"));
    const notes = await runRoutine(routine);

    expect(notes).toEqual(['2026-11-13T12:00:00.000Z -7 days → 2026-11-06T12:00:00.000Z']);
  });

  it("resolves $now (or any earlier $var) as the base, through the template", async () => {
    const routine = routineOf(
      { id: "s1", type: "saveValue", value: "2026-01-01T00:00:00.000Z", saveAs: "base" },
      addTime("$base", 1, "hours", "s2")
    );
    const notes = await runRoutine(routine);

    expect(notes[1]).toContain("2026-01-01T01:00:00.000Z");
  });

  it("covers every unit", async () => {
    const seconds = await runRoutine(routineOf(addTime("2026-01-01T00:00:00.000Z", 30, "seconds")));
    expect(seconds[0]).toContain("2026-01-01T00:00:30.000Z");

    const hours = await runRoutine(routineOf(addTime("2026-01-01T00:00:00.000Z", 2, "hours")));
    expect(hours[0]).toContain("2026-01-01T02:00:00.000Z");
  });

  it("fails when the base cannot be parsed as a date", async () => {
    const err = await runRoutine(routineOf(addTime("not a date", 5, "minutes"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('"not a date" is not a date addTime can parse');
  });
});

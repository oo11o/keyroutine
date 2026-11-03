import { describe, it, expect } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// Not site-only: saveValue touches no page, so it works in a Common routine.
function routineOf(...steps: Step[]): Routine {
  return {
    id: "common",
    name: "Common routine",
    binding: { code: "Digit8", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

describe("saveValue", () => {
  it("stores a literal under $value", async () => {
    const notes = await runRoutine(routineOf({ id: "s1", type: "saveValue", value: "hello" }));

    expect(notes).toEqual([`saved "hello"`]);
  });

  it("resolves $vars in the template and makes the result available under saveAs", async () => {
    const notes = await runRoutine(
      routineOf(
        { id: "s1", type: "saveValue", value: "first", saveAs: "a" },
        { id: "s2", type: "saveValue", value: "$a-done" }
      )
    );

    expect(notes).toEqual([`saved "first"`, `saved "first-done"`]);
  });

  it("fails with an unknown-variable error when the template references nothing", async () => {
    const err = await runRoutine(
      routineOf({ id: "s1", type: "saveValue", value: "$missing" })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/unknown variable "\$missing"/);
  });
});

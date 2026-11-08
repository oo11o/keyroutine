import { describe, it, expect } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// Not site-only: regexExtract touches no page, so it works in a Common routine.
function routineOf(...steps: Step[]): Routine {
  return {
    id: "common",
    name: "Common routine",
    binding: { code: "Digit8", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

describe("regexExtract", () => {
  it("saves the first capture group by default", async () => {
    const notes = await runRoutine(
      routineOf({
        id: "s1",
        type: "regexExtract",
        input: "https://example.com/orders/24344692/edit",
        pattern: "orders/(\\d+)/edit"
      })
    );

    expect(notes).toEqual(['matched "24344692"']);
  });

  it("resolves $vars in the input before matching", async () => {
    const notes = await runRoutine(
      routineOf(
        { id: "s1", type: "saveValue", value: "https://a.test/orders/412", saveAs: "url" },
        { id: "s2", type: "regexExtract", input: "$url", pattern: "orders/(\\d+)" }
      )
    );

    expect(notes).toEqual([`saved "https://a.test/orders/412"`, `matched "412"`]);
  });

  it("saves the whole match when the pattern has no capture group", async () => {
    const notes = await runRoutine(
      routineOf({ id: "s1", type: "regexExtract", input: "abc 123 def", pattern: "\\d+" })
    );

    expect(notes).toEqual(['matched "123"']);
  });

  it("saves an explicit group, including 0 for the whole match", async () => {
    const notes = await runRoutine(
      routineOf({
        id: "s1",
        type: "regexExtract",
        input: "2024-03-05",
        pattern: "(\\d+)-(\\d+)-(\\d+)",
        group: 2
      })
    );
    expect(notes).toEqual(['matched "03"']);

    const whole = await runRoutine(
      routineOf({ id: "s1", type: "regexExtract", input: "2024-03-05", pattern: "(\\d+)-(\\d+)-(\\d+)", group: 0 })
    );
    expect(whole).toEqual(['matched "2024-03-05"']);
  });

  it("fails when the pattern does not match", async () => {
    const err = await runRoutine(
      routineOf({ id: "s1", type: "regexExtract", input: "abc", pattern: "\\d+" })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toContain("did not match");
  });

  it("fails on an invalid regular expression, naming the pattern", async () => {
    const err = await runRoutine(
      routineOf({ id: "s1", type: "regexExtract", input: "abc", pattern: "(" })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toContain("(");
  });

  it("fails with an unknown-variable error when the input references nothing", async () => {
    const err = await runRoutine(
      routineOf({ id: "s1", type: "regexExtract", input: "$missing", pattern: "\\d+" })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/unknown variable "\$missing"/);
  });
});

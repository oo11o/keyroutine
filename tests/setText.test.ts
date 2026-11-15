import { describe, it, expect, beforeEach } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// setText is site-only (it names a selector) — see siteOnly in
// core/stepMeta.ts, and setAttribute.test.ts for the same reasoning.
function routineOf(...steps: Step[]): Routine {
  return {
    id: "r",
    name: "R",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    siteId: "site",
    steps
  };
}

beforeEach(() => {
  document.body.innerHTML = `<div id="label" class="selected class_text">old text</div>`;
});

describe("setText", () => {
  it("replaces an element's text content", async () => {
    const step: Step = { id: "s1", type: "setText", selector: "#label", value: "new text" };
    const notes = await runRoutine(routineOf(step));

    expect(document.querySelector("#label")!.textContent).toBe("new text");
    expect(notes).toEqual(['"new text" → "#label"']);
  });

  it("resolves $vars in the value", async () => {
    const routine = routineOf(
      { id: "s1", type: "saveValue", value: "resolved", saveAs: "v" },
      { id: "s2", type: "setText", selector: "#label", value: "it is $v" }
    );
    await runRoutine(routine);

    expect(document.querySelector("#label")!.textContent).toBe("it is resolved");
  });

  it("fails when the selector matches nothing", async () => {
    const step: Step = { id: "s1", type: "setText", selector: "#nope", value: "x" };
    const err = await runRoutine(routineOf(step)).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
  });
});

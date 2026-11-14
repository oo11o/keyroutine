import { describe, it, expect, beforeEach } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// setAttribute is site-only (it names a selector) — see siteOnly in
// core/stepMeta.ts, and focusBySelector.test.ts for the same reasoning.
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
  document.body.innerHTML = `
    <div id="panel" class="selected class_text" style="display: none;">hi</div>
    <button id="go" disabled>Go</button>`;
});

describe("setAttribute", () => {
  it("sets an attribute's value", async () => {
    const step: Step = { id: "s1", type: "setAttribute", selector: "#panel", attribute: "style", value: "display:block" };
    const notes = await runRoutine(routineOf(step));

    expect(document.querySelector("#panel")!.getAttribute("style")).toBe("display:block");
    expect(notes).toEqual(['style="display:block" on "#panel"']);
  });

  it("removes the attribute when value is explicitly blank", async () => {
    const step: Step = { id: "s1", type: "setAttribute", selector: "#go", attribute: "disabled", value: "" };
    const notes = await runRoutine(routineOf(step));

    expect(document.querySelector("#go")!.hasAttribute("disabled")).toBe(false);
    expect(notes).toEqual(['removed "disabled" from "#go"']);
  });

  it("removes the attribute when value is omitted entirely, the same as blank", async () => {
    // What the builder actually stores for an optional field left empty —
    // see patchStep/parseStep, which drop the field rather than keep "".
    const step = { id: "s1", type: "setAttribute", selector: "#go", attribute: "disabled" } as Step;
    await runRoutine(routineOf(step));

    expect(document.querySelector("#go")!.hasAttribute("disabled")).toBe(false);
  });

  it("resolves $vars in the value", async () => {
    const routine = routineOf(
      { id: "s1", type: "saveValue", value: "block", saveAs: "mode" },
      { id: "s2", type: "setAttribute", selector: "#panel", attribute: "style", value: "display:$mode" }
    );
    await runRoutine(routine);

    expect(document.querySelector("#panel")!.getAttribute("style")).toBe("display:block");
  });

  it("fails when the selector matches nothing", async () => {
    const step: Step = { id: "s1", type: "setAttribute", selector: "#nope", attribute: "style", value: "x" };
    const err = await runRoutine(routineOf(step)).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
  });
});

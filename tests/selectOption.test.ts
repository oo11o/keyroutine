import { describe, it, expect, beforeEach } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// selectOption is site-only (it names a selector) — see siteOnly in
// core/stepMeta.ts, and focusBySelector.test.ts for the same reasoning.
function routineOf(...steps: Step[]): Routine {
  return {
    id: "form",
    name: "Form",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    siteId: "site",
    steps
  };
}

const choose = (selector: string, value: string, id = "s1"): Step => ({
  id,
  type: "selectOption",
  selector,
  value
});

beforeEach(() => {
  document.body.innerHTML = `
    <select id="country">
      <option value="GB">United Kingdom</option>
      <option value="US">United States</option>
    </select>
    <input id="text-field" />`;
});

describe("selectOption", () => {
  it("picks the option whose value matches", async () => {
    const notes = await runRoutine(routineOf(choose("#country", "US")));

    expect((document.querySelector("#country") as HTMLSelectElement).value).toBe("US");
    expect(notes).toEqual(['chose "United States" in "#country"']);
  });

  it("falls back to the option's visible text when no value matches", async () => {
    await runRoutine(routineOf(choose("#country", "United Kingdom")));

    expect((document.querySelector("#country") as HTMLSelectElement).value).toBe("GB");
  });

  it("fires input and change, so React-style forms notice", async () => {
    const seen: string[] = [];
    const el = document.querySelector("#country")!;
    el.addEventListener("input", () => seen.push("input"));
    el.addEventListener("change", () => seen.push("change"));

    await runRoutine(routineOf(choose("#country", "US")));

    expect(seen).toEqual(["input", "change"]);
  });

  it("fails when nothing matches the given value or text", async () => {
    const err = await runRoutine(routineOf(choose("#country", "Germany"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No option "Germany" in this select');
  });

  it("fails when the selector matches nothing", async () => {
    const err = await runRoutine(routineOf(choose("#nope", "US"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
  });

  it("refuses an element that is not a <select>", async () => {
    const err = await runRoutine(routineOf(choose("#text-field", "US"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('Element "#text-field" is not a <select>');
  });
});

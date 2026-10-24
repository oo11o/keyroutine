import { describe, it, expect, beforeEach } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import type { Routine, Step } from "../src/core/schema";

// Scoped to a site: several step types here are site-only now (anything
// that names a selector, since a selector written for one page's markup
// means nothing, or the wrong thing, on every other page a Common routine
// would also fire on) — see siteOnly in core/stepMeta.ts.
function routineOf(...steps: Step[]): Routine {
  return {
    id: "login",
    name: "Log in",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    siteId: "site",
    steps
  };
}

const focus = (selector: string, id = "s1"): Step => ({ id, type: "focusBySelector", selector });

beforeEach(() => {
  document.body.innerHTML = `
    <input name="email" />
    <input name="password" />
    <input name="disabled" disabled />
    <div id="plaindiv">not focusable</div>`;
});

describe("focusBySelector", () => {
  it("puts focus on the field the selector matches", async () => {
    const notes = await runRoutine(routineOf(focus('[name="email"]')));

    expect(document.activeElement).toBe(document.querySelector('[name="email"]'));
    expect(notes).toEqual(['focused "[name="email"]"']);
  });

  it("fires focus events, which is why a page might need this at all", async () => {
    const seen: string[] = [];
    const el = document.querySelector('[name="email"]')!;
    el.addEventListener("focus", () => seen.push("focus"));
    el.addEventListener("focusin", () => seen.push("focusin"));

    await runRoutine(routineOf(focus('[name="email"]')));

    expect(seen).toEqual(["focus", "focusin"]);
  });

  it("moves focus between fields when run twice in a routine", async () => {
    await runRoutine(
      routineOf(focus('[name="email"]', "s1"), focus('[name="password"]', "s2"))
    );

    expect(document.activeElement).toBe(document.querySelector('[name="password"]'));
  });

  it("blurs the previous field, so its on-blur validation runs", async () => {
    const blurred: string[] = [];
    document.querySelector('[name="email"]')!.addEventListener("blur", () => blurred.push("email"));

    await runRoutine(routineOf(focus('[name="email"]', "s1"), focus('[name="password"]', "s2")));

    expect(blurred).toEqual(["email"]);
  });

  it("fails the step when nothing matches", async () => {
    const err = await runRoutine(routineOf(focus("#nope"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('No element for "#nope"');
  });

  it("reports a field that refused focus instead of claiming success", async () => {
    // el.focus() on a disabled input is silently a no-op in the DOM — the
    // step would otherwise report "focused" with focus still on <body>.
    const err = await runRoutine(routineOf(focus('[name="disabled"]'))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/did not take focus/);
  });

  it("reports a plain element with no tabindex the same way", async () => {
    const err = await runRoutine(routineOf(focus("#plaindiv"))).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/did not take focus/);
  });

  it("focuses a non-field element that opts in with tabindex", async () => {
    document.body.innerHTML = `<div id="menu" tabindex="0">menu</div>`;

    await runRoutine(routineOf(focus("#menu")));

    expect(document.activeElement).toBe(document.querySelector("#menu"));
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import { MAX_WAIT_MS } from "../src/page/wait";
import type { Routine, Step } from "../src/core/schema";

// Scoped to a site: waitForSelector names a selector, so it is site-only —
// see siteOnly in core/stepMeta.ts.
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

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForSelector", () => {
  it("resolves immediately when the element is already there", async () => {
    document.body.innerHTML = `<div id="target"></div>`;

    const notes = await runRoutine(
      routineOf({ id: "s1", type: "waitForSelector", selector: "#target", timeoutMs: 1000 })
    );

    expect(notes).toEqual([`found "#target"`]);
  });

  it("waits for an element added after the step starts", async () => {
    setTimeout(() => {
      document.body.innerHTML = `<div id="target"></div>`;
    }, 30);

    const notes = await runRoutine(
      routineOf({ id: "s1", type: "waitForSelector", selector: "#target", timeoutMs: 1000 })
    );

    expect(notes).toEqual([`found "#target"`]);
  });

  it("runs the steps after it once the element shows up", async () => {
    document.body.innerHTML = `<input id="f" />`;

    await runRoutine(
      routineOf(
        { id: "s1", type: "waitForSelector", selector: "#f", timeoutMs: 1000 },
        { id: "s2", type: "inputToSelector", selector: "#f", value: "ran" }
      )
    );

    expect(document.querySelector<HTMLInputElement>("#f")!.value).toBe("ran");
  });

  it("times out when the element never appears", async () => {
    const err = await runRoutine(
      routineOf({ id: "s1", type: "waitForSelector", selector: "#missing", timeoutMs: 50 })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/No element for "#missing" within 50ms/);
  });

  it("caps the timeout, so a typo cannot wedge the routine", async () => {
    const err = await runRoutine(
      routineOf({ id: "s1", type: "waitForSelector", selector: "#missing", timeoutMs: 600_000 })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe(`waitForSelector is capped at ${MAX_WAIT_MS}ms, got 600000`);
  });
});

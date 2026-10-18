import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runStack, StepError } from "../src/content/runner";
import { MAX_WAIT_MS } from "../src/page/wait";
import type { Stack, Step } from "../src/core/schema";

function stackOf(...steps: Step[]): Stack {
  return {
    id: "login",
    name: "Log in",
    binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("wait", () => {
  it("pauses for the time asked, then carries on", async () => {
    const started = Date.now();

    const notes = await runStack(stackOf({ id: "s1", type: "wait", ms: 30 }));

    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    expect(notes).toEqual(["waited 30ms"]);
  });

  it("runs the steps after it", async () => {
    document.body.innerHTML = `<input id="f" />`;

    await runStack(
      stackOf({ id: "s1", type: "wait", ms: 1 }, {
        id: "s2",
        type: "inputToSelector",
        selector: "#f",
        value: "ran"
      })
    );

    expect(document.querySelector<HTMLInputElement>("#f")!.value).toBe("ran");
  });

  it("refuses a negative wait", async () => {
    const err = await runStack(stackOf({ id: "s1", type: "wait", ms: -5 })).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toMatch(/positive ms/);
  });

  it("caps the wait, so a typo cannot wedge the stack", async () => {
    // 600000 instead of 600 would otherwise block for ten minutes.
    const err = await runStack(stackOf({ id: "s1", type: "wait", ms: 600_000 })).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe(`wait is capped at ${MAX_WAIT_MS}ms, got 600000`);
  });
});

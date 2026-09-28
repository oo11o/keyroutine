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

describe("waitForSelector", () => {
  it("returns at once when the element is already there", async () => {
    document.body.innerHTML = `<input name="email" />`;
    const started = Date.now();

    await runStack(stackOf({ id: "s1", type: "waitForSelector", selector: '[name="email"]' }));

    expect(Date.now() - started).toBeLessThan(40); // no poll interval paid
  });

  it("waits for an element that arrives late — the whole point", async () => {
    // Exactly the React case: document_idle has passed, the form has not
    // mounted yet.
    setTimeout(() => {
      document.body.innerHTML = `<input name="email" />`;
    }, 60);

    const notes = await runStack(
      stackOf({ id: "s1", type: "waitForSelector", selector: '[name="email"]' })
    );

    expect(document.querySelector('[name="email"]')).not.toBeNull();
    expect(notes[0]).toMatch(/^waited \d+ms for "\[name="email"\]"$/);
  });

  it("unblocks the step that would otherwise have failed", async () => {
    setTimeout(() => {
      document.body.innerHTML = `<input name="email" />`;
    }, 50);

    await runStack(
      stackOf({ id: "s1", type: "waitForSelector", selector: '[name="email"]' }, {
        id: "s2",
        type: "inputToSelector",
        selector: '[name="email"]',
        value: "buyer_test@dzo.com.ua"
      })
    );

    expect(document.querySelector<HTMLInputElement>('[name="email"]')!.value).toBe(
      "buyer_test@dzo.com.ua"
    );
  });

  it("fails with a clear timeout when the element never appears", async () => {
    const err = await runStack(
      stackOf({ id: "s1", type: "waitForSelector", selector: "#never", timeoutMs: 100 })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(StepError);
    expect(err.message).toBe('Timed out after 100ms waiting for "#never"');
  });

  it("stops the stack on timeout rather than running the next step blind", async () => {
    document.body.innerHTML = `<input id="after" />`;

    await runStack(
      stackOf({ id: "s1", type: "waitForSelector", selector: "#never", timeoutMs: 60 }, {
        id: "s2",
        type: "inputToSelector",
        selector: "#after",
        value: "ran"
      })
    ).catch(() => {});

    expect(document.querySelector<HTMLInputElement>("#after")!.value).toBe("");
  });

  it("caps the timeout the same way wait does", async () => {
    const err = await runStack(
      stackOf({ id: "s1", type: "waitForSelector", selector: "#x", timeoutMs: 600_000 })
    ).catch((e) => e);

    expect(err.message).toMatch(/capped at/);
  });
});

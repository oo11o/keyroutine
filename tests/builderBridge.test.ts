import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listenForBuilder } from "../src/content/builderBridge";
import {
  PROBE_MESSAGE_TYPE,
  TRY_MESSAGE_TYPE,
  type ProbeResponse,
  type TryResponse
} from "../src/core/builderProtocol";
import type { Stack } from "../src/core/schema";

// The page's side of the builder's questions. Worth testing here rather than
// through the options page: this is the half that runs where the DOM is, and
// "how many elements match" and "what happened to each action" are answers
// nothing else in the suite produces.

type Listener = (message: unknown, sender: unknown, respond: (r: unknown) => void) => boolean;

let listener: Listener;

function stack(steps: Stack["steps"]): Stack {
  return {
    id: "try-me",
    name: "Try me",
    binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
    enabled: true,
    steps
  };
}

// The listener answers either synchronously or through the callback, which is
// how chrome.runtime.onMessage works; both arrive here as a promise.
function ask<T>(message: object): Promise<T> {
  return new Promise((resolve) => listener(message, {}, (r) => resolve(r as T)));
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: (fn: Listener) => {
          listener = fn;
        }
      }
    },
    storage: { local: { get: async () => ({}) } }
  });
  listenForBuilder();
});

afterEach(() => vi.unstubAllGlobals());

describe("testing a selector", () => {
  it("counts what the selector matches on this page", async () => {
    document.body.innerHTML = '<p class="x"></p><p class="x"></p>';

    await expect(ask<ProbeResponse>({ type: PROBE_MESSAGE_TYPE, selector: ".x" })).resolves.toEqual({
      count: 2
    });
    await expect(ask<ProbeResponse>({ type: PROBE_MESSAGE_TYPE, selector: "#none" })).resolves.toEqual({
      count: 0
    });
  });

  it("tells a broken selector apart from one that simply misses", async () => {
    const response = await ask<ProbeResponse>({ type: PROBE_MESSAGE_TYPE, selector: "p[" });

    expect(response).toMatchObject({ error: expect.stringContaining("CSS selector") });
  });
});

describe("running a stack from the builder", () => {
  it("reports an outcome per action, and skips everything after a failure", async () => {
    document.body.innerHTML = '<input id="tender_id" value="T-42" />';

    const response = await ask<TryResponse>({
      type: TRY_MESSAGE_TYPE,
      stack: stack([
        { id: "text", type: "readBySelector", selector: "#tender_id" },
        { id: "s1", type: "clickBySelector", selector: "#search" },
        { id: "s2", type: "clickBySelector", selector: "#tender_id" }
      ])
    });

    expect("results" in response && response.results).toEqual([
      { outcome: "ok", note: 'read "T-42"' },
      { outcome: "fail", note: 'No element for "#search"' },
      // It never ran, so it is neither a pass nor a failure.
      { outcome: "skip", note: "" }
    ]);
  });

  it("reports every action as ok when the whole stack goes through", async () => {
    document.body.innerHTML = '<input id="tender_id" value="T-7" /><input id="search" />';

    const response = await ask<TryResponse>({
      type: TRY_MESSAGE_TYPE,
      stack: stack([
        { id: "text", type: "readBySelector", selector: "#tender_id" },
        { id: "s1", type: "inputToSelector", selector: "#search", value: "$text" }
      ])
    });

    expect("results" in response && response.results.map((r) => r.outcome)).toEqual(["ok", "ok"]);
    expect(document.querySelector<HTMLInputElement>("#search")!.value).toBe("T-7");
  });
});

describe("messages that are not ours", () => {
  it("are left for whoever they belong to", () => {
    // The worker's messages come through the same listener, and answering them
    // would be worse than ignoring them.
    const respond = vi.fn();
    expect(listener({ type: "keystack-take-resume" }, {}, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
  });
});

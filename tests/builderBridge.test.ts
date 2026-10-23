import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listenForBuilder } from "../src/content/builderBridge";
import { PROBE_MESSAGE_TYPE, type ProbeResponse } from "../src/core/builderProtocol";

// The page's side of the builder's questions. Worth testing here rather than
// through the options page: this is the half that runs where the DOM is, and
// "how many elements match this selector" is an answer nothing else in the
// suite produces.

type Listener = (message: unknown, sender: unknown, respond: (r: unknown) => void) => boolean;

let listener: Listener;

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

describe("messages that are not ours", () => {
  it("are left for whoever they belong to", () => {
    // The worker's messages come through the same listener, and answering them
    // would be worse than ignoring them.
    const respond = vi.fn();
    expect(listener({ type: "keyroutine-take-resume" }, {}, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
  });
});

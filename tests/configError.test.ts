import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveStack, isConfigError, type ConfigError } from "../src/content/stackResolver";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { stubChromeStorage } from "./fakeChrome";

// The config used to be a bundled file fetched on every keydown, so the seam
// was fetch. It now lives in chrome.storage.local, so the seam is storage —
// and a syntax error is no longer possible (storage holds an object, not
// text). What is still very possible is a stored config of the wrong shape:
// hand-edited, imported, or written by an older version.
function stubConfig(config: unknown) {
  stubChromeStorage({ [CONFIG_KEY]: config });
}

// ⌃⌥1 by default — a plausible chord. Pass no modifiers for ordinary typing.
function keydown(over: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", { code: "Digit1", ctrlKey: true, altKey: true, ...over });
}

const VALID = {
  schemaVersion: 2,
  sites: [],
  stacks: [
    {
      id: "copy-id",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#tender_id" }]
    }
  ]
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearCache();
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("an unreadable config", () => {
  it("reports the validation errors instead of silently doing nothing", async () => {
    // The shape that breaks it now: a stack half-written by hand, with no
    // binding for the chord to match against.
    stubConfig({ stacks: [{ id: "a" }] });

    const result = await resolveStack(keydown());

    expect(isConfigError(result)).toBe(true);
    expect((result as ConfigError).configError).toMatch(/binding/);
  });

  it("reports a config that is not shaped like one at all", async () => {
    stubConfig({ schemaVersion: 2 });

    expect((await resolveStack(keydown()) as ConfigError).configError).toBe(
      'no "stacks" array in the config'
    );
  });

  it("does not throw when stacks is the wrong type — it reports", async () => {
    stubConfig({ stacks: "not an array" });

    // Unguarded this rejects inside a keydown listener, where nothing catches it.
    await expect(resolveStack(keydown())).resolves.toBeTruthy();
  });

  it("stays silent for ordinary typing, so a broken config cannot spam toasts", async () => {
    stubConfig({ stacks: [{ id: "a" }] });

    expect(await resolveStack(keydown({ ctrlKey: false, altKey: false }))).toBeNull();
    expect(await resolveStack(keydown({ ctrlKey: false, altKey: false, shiftKey: true }))).toBeNull();
  });

  it("still reports for a Cmd or Ctrl chord, not just Ctrl+Alt", async () => {
    stubConfig({ stacks: [{ id: "a" }] });

    expect(isConfigError(await resolveStack(keydown({ ctrlKey: false, altKey: false, metaKey: true })))).toBe(true);
    expect(isConfigError(await resolveStack(keydown({ altKey: false })))).toBe(true);
  });

  it("stays silent while focus is in a text field, config broken or not", async () => {
    stubConfig({ stacks: [{ id: "a" }] });
    document.body.innerHTML = `<input id="typing" />`;
    const input = document.querySelector("#typing")!;

    const e = new KeyboardEvent("keydown", { code: "Digit1", ctrlKey: true, altKey: true });
    Object.defineProperty(e, "target", { value: input });

    expect(await resolveStack(e)).toBeNull();
  });

  it("is silent, not an error, when nothing has been configured yet", async () => {
    // An empty config is the normal state of a fresh profile — pressing a
    // chord there must not accuse the user of breaking something.
    stubChromeStorage();

    expect(await resolveStack(keydown())).toBeNull();
  });
});

describe("a readable config", () => {
  it("still resolves a matching chord to its stack", async () => {
    stubConfig(VALID);

    const result = await resolveStack(keydown());

    expect(isConfigError(result)).toBe(false);
    expect(result).toMatchObject({ stack: { id: "copy-id" } });
  });

  it("still returns null for a chord nothing is bound to", async () => {
    stubConfig(VALID);

    expect(await resolveStack(keydown({ code: "Digit9" }))).toBeNull();
  });

  it("reads a schemaVersion 1 config, so an existing profile keeps working", async () => {
    stubConfig({ schemaVersion: 1, stacks: VALID.stacks });

    expect(await resolveStack(keydown())).toMatchObject({ stack: { id: "copy-id" } });
  });
});

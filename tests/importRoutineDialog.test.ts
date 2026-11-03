import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import { openImportRoutine } from "../src/options/portJson";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { stubChromeStorage } from "./fakeChrome";

// The Import routine dialog — the single-routine sibling of the Import
// dialog tested in portJson.test.ts.

const SEED = {
  schemaVersion: 2,
  sites: [],
  routines: [
    {
      id: "one",
      name: "One",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "popup", body: "hi" }]
    }
  ]
};

const PASTED = {
  name: "Pasted",
  binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
  enabled: true,
  steps: [{ id: "s1", type: "popup", body: "hi" }]
};

function area(): HTMLTextAreaElement {
  return document.querySelector("dialog textarea") as HTMLTextAreaElement;
}

beforeEach(async () => {
  document.body.replaceChildren();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
    const target = this.querySelector("[autofocus]");
    if (target instanceof HTMLElement) target.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  stubChromeStorage({ [CONFIG_KEY]: structuredClone(SEED) });
  await store.init(null, []);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("the Import routine dialog", () => {
  it("opens with the caret in the box, so the first paste lands there", () => {
    openImportRoutine(() => {});

    expect(area().autofocus).toBe(true);
    expect(document.activeElement).toBe(area());
  });

  it("adds the pasted routine on ⌘/Ctrl+Enter and closes", () => {
    let done = 0;
    openImportRoutine(() => (done += 1));

    area().value = JSON.stringify(PASTED);
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));

    expect(done).toBe(1);
    expect(store.getConfig().routines.map((s) => s.name)).toEqual(["One", "Pasted"]);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("keeps the dialog open and says why when the paste is not JSON", () => {
    openImportRoutine(() => {});

    area().value = "{ nope";
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));

    expect(document.querySelector("dialog .problems")?.textContent).toContain("not valid JSON");
    expect(store.getConfig().routines.map((s) => s.name)).toEqual(["One"]);
  });

  it("keeps the dialog open and says why when the routine is refused", () => {
    openImportRoutine(() => {});

    area().value = JSON.stringify({
      name: "Leaky",
      binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "clickBySelector", selector: "#go" }]
    });
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));

    expect(document.querySelector("dialog .problems")?.textContent).toContain(
      "only available in a routine scoped to a site"
    );
    expect(store.getConfig().routines.map((s) => s.name)).toEqual(["One"]);
  });

  it("leaves a plain Enter to the textarea, since JSON has newlines", () => {
    openImportRoutine(() => {});

    area().value = JSON.stringify(PASTED);
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(document.querySelector("dialog")).not.toBeNull();
    expect(store.getConfig().routines.map((s) => s.name)).toEqual(["One"]);
  });
});

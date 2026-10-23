import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import { openImport } from "../src/options/portJson";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { stubChromeStorage } from "./fakeChrome";

// The Import dialog. Worth testing at this level because the bug it had was
// about focus, not about parsing: the config never reached the box.

const SEED = {
  schemaVersion: 2,
  sites: [],
  stacks: [
    {
      id: "one",
      name: "One",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "popup", body: "hi" }]
    }
  ]
};

const INCOMING = {
  schemaVersion: 2,
  sites: [{ id: "app", name: "app.example.com", patterns: ["app.example.com"] }],
  stacks: [
    {
      id: "two",
      name: "Two",
      binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "app",
      steps: [{ id: "s1", type: "clickBySelector", selector: "#go" }]
    }
  ]
};

function area(): HTMLTextAreaElement {
  return document.querySelector("dialog textarea") as HTMLTextAreaElement;
}

beforeEach(async () => {
  document.body.replaceChildren();
  // jsdom has no modal dialog: enough of one to exercise focus and close.
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

describe("the Import dialog", () => {
  it("opens with the caret in the box, so the first paste lands there", () => {
    openImport(() => {});

    // Both the declaration the dialog's focusing steps read and the result.
    expect(area().autofocus).toBe(true);
    expect(document.activeElement).toBe(area());
  });

  it("loads a pasted config on ⌘/Ctrl+Enter, without reaching for the button", () => {
    let done = 0;
    openImport(() => (done += 1));

    area().value = JSON.stringify(INCOMING);
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));

    expect(done).toBe(1);
    expect(store.getConfig().stacks.map((s) => s.id)).toEqual(["two"]);
    expect(document.querySelector("dialog")).toBeNull(); // closed and removed
  });

  it("keeps the dialog open and says why when the paste is not JSON", () => {
    openImport(() => {});

    area().value = "{ nope";
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));

    expect(document.querySelector("dialog .problems")?.textContent).toContain("not valid JSON");
    expect(store.getConfig().stacks.map((s) => s.id)).toEqual(["one"]); // draft untouched
  });

  it("leaves a plain Enter to the textarea, since JSON has newlines", () => {
    openImport(() => {});

    area().value = JSON.stringify(INCOMING);
    area().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(document.querySelector("dialog")).not.toBeNull();
    expect(store.getConfig().stacks.map((s) => s.id)).toEqual(["one"]);
  });
});

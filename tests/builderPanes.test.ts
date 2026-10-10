import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { renderSites } from "../src/options/sitesPane";
import { renderStacks } from "../src/options/stacksPane";
import { renderSteps } from "../src/options/stepsPane";
import { stubChromeStorage } from "./fakeChrome";

// The three columns, driven through the DOM rather than through the store — the
// nearest thing to clicking the builder that runs without a browser. Worth
// having: a pane that throws while rendering takes the whole page with it, and
// nothing else in the suite would notice.

const SEED = {
  schemaVersion: 2,
  sites: [{ id: "local", name: "dzo.lh", patterns: ["dzo.lh"] }],
  stacks: [
    {
      id: "show-tender",
      name: "Show Tender",
      binding: { code: "Digit7", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "fetchUrl", url: "https://api.test/t/$s1", saveAs: "tender" },
        { id: "s3", type: "popupJson", title: "Tender", body: "$tender" }
      ]
    }
  ]
};

// One pane per section, as main.ts lays them out.
const panes = { sites: document.createElement("section"), stacks: document.createElement("section"), steps: document.createElement("section") };

function draw(): void {
  for (const pane of Object.values(panes)) pane.replaceChildren();
  renderSites(panes.sites);
  renderStacks(panes.stacks);
  renderSteps(panes.steps);
}

function texts(pane: HTMLElement, selector: string): string[] {
  return [...pane.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? "");
}

function clickWithText(pane: HTMLElement, selector: string, needle: string): void {
  const el = [...pane.querySelectorAll(selector)].find((e) => e.textContent?.includes(needle));
  if (!el) throw new Error(`no ${selector} containing "${needle}" in\n${pane.textContent}`);
  (el as HTMLElement).click();
}

// The type menu's entries carry a line of help as well as a title, and one
// type's help can name another type ("prefer Wait for element…"), so this
// matches the title exactly rather than the row's whole text.
function clickStepType(pane: HTMLElement, label: string): void {
  const el = [...pane.querySelectorAll(".type-menu button")].find(
    (e) => e.firstElementChild?.textContent === label
  );
  if (!el) throw new Error(`no step type "${label}" in the menu`);
  (el as HTMLElement).click();
}

beforeEach(async () => {
  document.body.replaceChildren(panes.sites, panes.stacks, panes.steps);
  stubChromeStorage({ [CONFIG_KEY]: structuredClone(SEED) });
  await store.init("http://dzo.lh/tenders/1", ["runToken"]);
  draw();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("the Sites column", () => {
  it("lists Common first, then the sites, with a stack count each", () => {
    expect(texts(panes.sites, ".row .grow")).toEqual(["Common (all sites)", "dzo.lh"]);
    expect(texts(panes.sites, ".row .count")).toEqual(["1", "0"]);
  });

  it("says which tier of the cheatsheet each site's stacks land in", () => {
    expect(texts(panes.sites, ".row .tier")).toEqual(["domain"]);

    store.patchSite("local", { patterns: ["dzo.lh/tenders/new"] });
    draw();
    expect(texts(panes.sites, ".row .tier")).toEqual(["URL"]);

    store.patchSite("local", { patterns: ["dzo.lh", "dzo.lh/tenders/new"] });
    draw();
    expect(texts(panes.sites, ".row .tier")).toEqual(["mixed"]);
  });

  it("marks the site matching the page the builder was opened from", () => {
    const marks = texts(panes.sites, ".row .mark");
    expect(marks[1]).toBe("◉");
  });

  it("selects Common when clicked, and the Stacks column follows", () => {
    clickWithText(panes.sites, ".row", "Common");
    draw();

    expect(store.getScope()).toEqual({ kind: "common" });
    expect(texts(panes.stacks, ".row .grow")).toEqual(["Show Tender"]);
  });

  it("offers a site for the current host only when there is not one already", async () => {
    expect(panes.sites.textContent).not.toContain("+ Add a site for");

    await store.init("https://example.com/", []);
    draw();

    expect(panes.sites.textContent).toContain("+ Add a site for example.com");
  });
});

describe("the Stacks column", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    draw();
  });

  it("shows each stack's chord, name and step count", () => {
    expect(texts(panes.stacks, ".row .chord")[0]).toMatch(/7$/);
    expect(texts(panes.stacks, ".row .grow")).toEqual(["Show Tender"]);
    expect(texts(panes.stacks, ".row .count")).toEqual(["3"]);
  });

  it("edits the name through the editor, and the row keeps up", () => {
    const name = panes.stacks.querySelector("#stack-name") as HTMLInputElement;
    name.value = "jsonShow";
    name.dispatchEvent(new Event("input"));
    draw();

    expect(texts(panes.stacks, ".row .grow")).toEqual(["jsonShow"]);
    expect(store.isDirty()).toBe(true);
  });

  it("moves a stack to a site through the Runs on dropdown", () => {
    const select = panes.stacks.querySelector("#stack-site") as HTMLSelectElement;
    select.value = "local";
    select.dispatchEvent(new Event("change"));

    expect(store.getConfig().stacks[0].siteId).toBe("local");
  });

  it("adds a stack, which arrives selected and with a free chord", () => {
    clickWithText(panes.stacks, "button", "+ Add stack");
    draw();

    expect(store.currentStack()?.name).toBe("New stack");
    expect(store.currentStack()?.binding.code).toBe("Digit1"); // ⌃⌥7 was the only one taken
    expect(texts(panes.stacks, ".row .grow")).toEqual(["Show Tender", "New stack"]);
  });

  it("warns on the row and in the editor when two stacks share a chord", () => {
    clickWithText(panes.stacks, "button", "+ Add stack");
    store.patchStack(store.currentStack()!.id, { binding: SEED.stacks[0].binding });
    draw();

    expect(texts(panes.stacks, ".row .mark")).toContain("⚠");
    expect(panes.stacks.textContent).toContain("shares its chord");
  });
});

describe("the Steps column", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    draw();
  });

  it("lists the steps in run order with a one-line summary", () => {
    expect(texts(panes.steps, ".step-row .label")).toEqual([
      "Read element",
      "Fetch URL",
      "Show popup (JSON)"
    ]);
    expect(texts(panes.steps, ".step-row .summary")[1]).toBe("fetch https://api.test/t/$s1");
  });

  it("shows what a producing step exposes to the steps after it", () => {
    expect(texts(panes.steps, ".step-row .exposes")).toEqual([
      "→ $s1, $value",
      "→ $s2, $tender, $value"
    ]);
  });

  it("renders the open step's fields from its metadata, required ones first", () => {
    store.selectStep("s2");
    draw();

    const labels = texts(panes.steps, ".editor .field > label");
    expect(labels[0]).toBe("URL *");
    // saveAs is advanced, and it is set here, so the disclosure starts open.
    expect(panes.steps.querySelector("details.advanced")?.hasAttribute("open")).toBe(true);
  });

  it("edits a field into the draft", () => {
    store.selectStep("s1");
    draw();
    const selector = panes.steps.querySelector("#f-selector") as HTMLInputElement;

    selector.value = "#other_id";
    selector.dispatchEvent(new Event("input"));

    expect(store.currentStack()!.steps[0]).toMatchObject({ selector: "#other_id" });
  });

  it("says so, next to the field, when a $var does not exist here", () => {
    store.selectStep("s2");
    draw();
    const url = panes.steps.querySelector("#f-url") as HTMLInputElement;

    url.value = "https://api.test/t/$nope";
    url.dispatchEvent(new Event("input"));

    const problem = panes.steps.querySelector("#f-url")!.closest(".field")!.querySelector(".bad")!;
    expect(problem.textContent).toContain("$nope");
    expect((problem as HTMLElement).hidden).toBe(false);
  });

  it("offers a step only the values that exist by the time it runs", () => {
    store.selectStep("s2");
    draw();
    (panes.steps.querySelector(".var-btn") as HTMLElement).click();

    const offered = texts(panes.steps, ".var-menu .name");
    expect(offered).toContain("$s1"); // the read before it
    expect(offered).toContain("$url"); // a builtin
    expect(offered).toContain("$secret_runToken");
    expect(offered).not.toContain("$tender"); // its own output, not available to itself
  });

  it("inserts the picked value at the caret and into the draft", () => {
    store.selectStep("s2");
    draw();
    const url = panes.steps.querySelector("#f-url") as HTMLInputElement;
    url.value = "https://api.test/t/";
    url.setSelectionRange(url.value.length, url.value.length);
    (panes.steps.querySelector(".var-btn") as HTMLElement).click();

    clickWithText(panes.steps, ".var-menu button", "$s1");

    expect(url.value).toBe("https://api.test/t/$s1");
    expect(store.currentStack()!.steps[1]).toMatchObject({ url: "https://api.test/t/$s1" });
  });

  it("adds a step from the grouped type menu", () => {
    clickWithText(panes.steps, "button", "+ Add step");
    clickStepType(panes.steps, "Wait for element");
    draw();

    expect(texts(panes.steps, ".step-row .label").at(-1)).toBe("Wait for element");
    expect(store.currentStep()).toMatchObject({ type: "waitForSelector", timeoutMs: 5000 });
  });

  it("reorders and deletes from the row's own tools", () => {
    const tools = (index: number, title: string) =>
      panes.steps.querySelectorAll(".step-row")[index].querySelector(`[title="${title}"]`) as HTMLElement;

    tools(2, "Move up").click();
    draw();
    expect(texts(panes.steps, ".step-row .label")[1]).toBe("Show popup (JSON)");

    tools(1, "Delete").click();
    draw();
    expect(texts(panes.steps, ".step-row .label")).toEqual(["Read element", "Fetch URL"]);
  });
});

describe("building the user's example from scratch", () => {
  it("goes read → fetch → popupJson, wired by the $ picker, and saves", async () => {
    store.selectScope({ kind: "common" });
    draw();

    // A new stack, named.
    clickWithText(panes.stacks, "button", "+ Add stack");
    draw();
    const name = panes.stacks.querySelector("#stack-name") as HTMLInputElement;
    name.value = "jsonShow";
    name.dispatchEvent(new Event("input"));
    draw();

    // Step 1: copy the id off the page.
    clickWithText(panes.steps, "button", "+ Add step");
    clickStepType(panes.steps, "Read element");
    draw();
    const selector = panes.steps.querySelector("#f-selector") as HTMLInputElement;
    selector.value = "#tender_id";
    selector.dispatchEvent(new Event("input"));

    // Step 2: fetch with it, picking $s1 rather than typing it.
    clickWithText(panes.steps, "button", "+ Add step");
    clickStepType(panes.steps, "Fetch URL");
    draw();
    const url = panes.steps.querySelector("#f-url") as HTMLInputElement;
    url.value = "https://api.test/tenders/";
    url.dispatchEvent(new Event("input"));
    url.setSelectionRange(url.value.length, url.value.length);
    (panes.steps.querySelector(".var-btn") as HTMLElement).click();
    clickWithText(panes.steps, ".var-menu button", "$s1");
    draw();
    const saveAs = panes.steps.querySelector("#f-saveAs") as HTMLInputElement;
    saveAs.value = "json";
    saveAs.dispatchEvent(new Event("input"));

    // Step 3: show it.
    clickWithText(panes.steps, "button", "+ Add step");
    clickStepType(panes.steps, "Show popup (JSON)");
    draw();
    const body = panes.steps.querySelector("#f-body") as HTMLTextAreaElement;
    body.value = "$json";
    body.dispatchEvent(new Event("input"));

    await expect(store.save()).resolves.toEqual({ ok: true });

    const stack = store.getConfig().stacks.find((s) => s.name === "jsonShow")!;
    expect(stack.steps).toEqual([
      { id: "s1", type: "readBySelector", selector: "#tender_id" },
      { id: "s2", type: "fetchUrl", url: "https://api.test/tenders/$s1", saveAs: "json" },
      { id: "s3", type: "popupJson", body: "$json" }
    ]);
  });
});

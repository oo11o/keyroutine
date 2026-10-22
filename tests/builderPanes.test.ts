import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import * as probe from "../src/options/probe";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { renderSites } from "../src/options/sitesPane";
import { renderStacks } from "../src/options/stacksPane";
import { renderSteps } from "../src/options/stepsPane";
import { PICK_MESSAGE_TYPE } from "../src/core/builderProtocol";
import { stubChromeStorage, stubChromeTabs } from "./fakeChrome";

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
const panes = {
  sites: document.createElement("section"),
  stacks: document.createElement("section"),
  steps: document.createElement("section")
};

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
// type's help can name another type ("pair it with Press key…"), so this
// matches the title exactly rather than the row's whole text.
function clickStepType(pane: HTMLElement, label: string): void {
  const el = [...pane.querySelectorAll(".type-menu button")].find(
    (e) => e.querySelector(".name")?.textContent === label
  );
  if (!el) throw new Error(`no action type "${label}" in the menu`);
  (el as HTMLElement).click();
}

function openStep(id: string): void {
  store.selectStep(id);
  draw();
}

beforeEach(async () => {
  document.body.replaceChildren(panes.sites, panes.stacks, panes.steps);
  stubChromeStorage({ [CONFIG_KEY]: structuredClone(SEED) });
  probe.forgetAll();
  await store.init("http://dzo.lh/tenders/1", ["runToken"]);
  draw();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("the Sites column", () => {
  it("lists Common first, then the sites, each with its stack count", () => {
    expect(texts(panes.sites, ".row .rowtitle")).toEqual(["Common", "dzo.lh"]);
    expect(texts(panes.sites, ".row .rowsub")[0]).toBe("Every site · 1 stack");
  });

  it("says which site claims the page the builder was opened from", () => {
    expect(texts(panes.sites, ".row .rowsub")[1]).toBe("0 stacks · this page");
  });

  it("selects Common when clicked, and the Stacks column follows", () => {
    clickWithText(panes.sites, ".row", "Common");
    draw();

    expect(store.getScope()).toEqual({ kind: "common" });
    expect(texts(panes.stacks, ".stackname")).toEqual(["Show Tender"]);
  });

  it("shows the selected site's patterns as chips, and removes one", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();
    expect(texts(panes.sites, ".chip")).toEqual(["dzo.lh"]);

    (panes.sites.querySelector('[aria-label="Remove dzo.lh"]') as HTMLElement).click();

    expect(store.getConfig().sites[0].patterns).toEqual([]);
  });

  it("adds a pattern on Enter, and says so while there are none", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.patchSite("local", { patterns: [] });
    draw();
    expect(panes.sites.textContent).toContain("matches nothing");

    const add = panes.sites.querySelector("#site-add-pattern") as HTMLInputElement;
    add.value = "*.dzo.com.ua";
    add.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(store.getConfig().sites[0].patterns).toEqual(["*.dzo.com.ua"]);
  });

  it("offers the current host as a new site only when no site claims it", async () => {
    expect(panes.sites.textContent).not.toContain("Add dzo.lh");

    await store.init("https://example.com/", []);
    draw();
    expect(panes.sites.textContent).toContain("Add example.com");

    clickWithText(panes.sites, "button", "Add example.com");

    expect(store.getConfig().sites.at(-1)).toMatchObject({
      name: "example.com",
      patterns: ["example.com"]
    });
  });
});

describe("the Stacks column", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    // The builder boots with every stack closed, so these start with the click
    // the user makes first: opening the one they came to work on.
    store.selectStack("show-tender");
    draw();
  });

  it("shows each stack's name, action count and hotkey", () => {
    expect(texts(panes.stacks, ".stackname")).toEqual(["Show Tender"]);
    expect(texts(panes.stacks, ".card .rowsub")[0]).toBe("3 actions · on");
    expect(texts(panes.stacks, ".keys kbd").at(-1)).toBe("7");
  });

  it("turns a stack off from the switch, without opening it", () => {
    (panes.stacks.querySelector(".switch") as HTMLElement).click();
    draw();

    expect(store.getConfig().stacks[0].enabled).toBe(false);
    expect(texts(panes.stacks, ".card .rowsub")[0]).toBe("3 actions · off");
    // And the Actions column says the hotkey is doing nothing.
    expect(panes.steps.textContent).toContain("This stack is off");
  });

  it("edits the name in the card that is open, and the card keeps up", () => {
    const name = panes.stacks.querySelector("#stack-name") as HTMLInputElement;
    name.value = "jsonShow";
    name.dispatchEvent(new Event("input"));
    draw();

    expect(texts(panes.stacks, ".stackname")).toEqual(["jsonShow"]);
    expect(store.isDirty()).toBe(true);
  });

  it("moves a stack to a site through the Site dropdown, and follows it there", () => {
    const select = panes.stacks.querySelector("#stack-site") as HTMLSelectElement;
    select.value = "local";
    select.dispatchEvent(new Event("change"));
    draw();

    expect(store.getConfig().stacks[0].siteId).toBe("local");
    expect(store.getScope()).toEqual({ kind: "site", siteId: "local" });
    expect(texts(panes.stacks, ".stackname")).toEqual(["Show Tender"]);
  });

  it("adds a stack, which arrives selected and with a free chord", () => {
    clickWithText(panes.stacks, "button", "New stack");
    draw();

    expect(store.currentStack()?.name).toBe("New stack");
    expect(store.currentStack()?.binding.code).toBe("Digit1"); // ⌃⌥7 was the only one taken
    expect(texts(panes.stacks, ".stackname")).toEqual(["Show Tender", "New stack"]);
  });

  it("names the rival, and its site, when two stacks share a hotkey", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.addStack("Local thing");
    store.patchStack(store.currentStack()!.id, { binding: SEED.stacks[0].binding });
    draw();

    // A site stack and a common one can both be live on the same page, so the
    // site has to be said out loud for the two to be told apart.
    expect(panes.stacks.querySelector(".conflict")?.textContent).toContain(
      "Same hotkey as Show Tender (Common)"
    );
    expect(panes.stacks.querySelector(".keys.is-conflict")).not.toBeNull();
    expect(panes.stacks.textContent).toContain("Record a different hotkey");
  });

  it("points at Common from a site, since those stacks work here too", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    expect(panes.stacks.textContent).toContain("+1 more from Common");
    clickWithText(panes.stacks, ".row", "more from Common");
    expect(store.getScope()).toEqual({ kind: "common" });
  });
});

// Ten stacks with ten editors open is not a list of hotkeys, it is a wall. The
// column stays a list until a card is asked for.
describe("the Stacks column on arrival", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    draw();
  });

  it("opens no card, and no editor with it", () => {
    expect(texts(panes.stacks, ".stackname")).toEqual(["Show Tender"]);
    expect(panes.stacks.querySelector(".cardbody")).toBeNull();
    expect(panes.stacks.querySelector(".stackpick")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the one that is clicked, and closes it when clicked again", () => {
    (panes.stacks.querySelector(".stackpick") as HTMLElement).click();
    draw();
    expect(panes.stacks.querySelector("#stack-name")).not.toBeNull();

    (panes.stacks.querySelector(".stackpick") as HTMLElement).click();
    draw();
    expect(panes.stacks.querySelector("#stack-name")).toBeNull();
  });
});

describe("the Actions column", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    store.selectStack("show-tender");
    draw();
  });

  it("opens with the hotkey that starts the stack", () => {
    expect(panes.steps.querySelector(".triggerline")?.textContent).toContain("When you press");
    expect(panes.steps.querySelector(".triggerline")?.textContent).toContain("any site");
  });

  it("lists the actions in run order, each with a one-line summary", () => {
    expect(texts(panes.steps, ".steptitle")).toEqual([
      "Read element",
      "Fetch URL",
      "Show popup (JSON)"
    ]);
    expect(texts(panes.steps, ".stepsum")[1]).toBe("https://api.test/t/$s1");
    // The trigger node and the "add" node are icons; the actions are numbered.
    expect(texts(panes.steps, ".node")).toEqual(["", "1", "2", "3", ""]);
  });

  it("chips the variable a producing action leaves behind", () => {
    expect(texts(panes.steps, ".stephead .outchip")).toEqual(["→ $s1", "→ $s2"]);
  });

  it("chips an action whose field names a variable nothing produces", () => {
    store.patchStep("s2", { url: "https://api.test/t/$nope" });
    draw();

    expect(texts(panes.steps, ".stephead .errchip")).toEqual(["$nope undefined"]);
  });

  it("opens one card at a time, and closes the open one", () => {
    // An open stack is a pipeline with every card shut, so the first click
    // here is what opens one at all.
    expect(panes.steps.querySelectorAll(".step.is-open")).toHaveLength(0);

    clickWithText(panes.steps, ".stephead", "Fetch URL");
    draw();
    expect(store.currentStep()?.id).toBe("s2");
    expect(panes.steps.querySelectorAll(".step.is-open")).toHaveLength(1);

    clickWithText(panes.steps, ".stephead", "Fetch URL");
    draw();
    expect(panes.steps.querySelectorAll(".step.is-open")).toHaveLength(0);
  });

  it("renders the open action's fields from its metadata", () => {
    openStep("s2");

    expect(texts(panes.steps, ".cardbody .field > .label")[0]).toBe("URL");
    expect((panes.steps.querySelector("#f-url") as HTMLInputElement).value).toBe(
      "https://api.test/t/$s1"
    );
  });

  it("gives a long value a field that wraps instead of scrolling sideways", () => {
    openStep("s2");
    const url = panes.steps.querySelector("#f-url") as HTMLTextAreaElement;

    // A textarea worn as a one-line field: a URL with a query string stays
    // whole and in place while it is edited, instead of sliding under the
    // caret.
    expect(url.tagName).toBe("TEXTAREA");
    expect(url.classList.contains("wrapbox")).toBe(true);

    // And it keeps up the pretence at both places a textarea would show
    // through: Enter does nothing, and a pasted newline never reaches the draft.
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    url.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);

    url.value = "https://api.test/t/\n1";
    url.dispatchEvent(new Event("input"));
    expect(store.currentStep()).toMatchObject({ url: "https://api.test/t/1" });
  });

  it("edits a field into the draft", () => {
    openStep("s1");
    const selector = panes.steps.querySelector("#f-selector") as HTMLInputElement;

    selector.value = "#other_id";
    selector.dispatchEvent(new Event("input"));

    expect(store.currentStack()!.steps[0]).toMatchObject({ selector: "#other_id" });
  });

  it("offers only the variables that exist by the time the action runs", () => {
    openStep("s2");

    const offered = texts(panes.steps, ".varchip");
    expect(offered).toContain("$s1"); // the read before it
    expect(offered).toContain("$url"); // a builtin
    expect(offered).toContain("$secret_runToken");
    expect(offered).not.toContain("$s2"); // its own output, not available to itself
  });

  it("says which variable is missing, next to the chips that fix it", () => {
    openStep("s2");
    const url = panes.steps.querySelector("#f-url") as HTMLInputElement;

    url.value = "https://api.test/t/$nope";
    url.dispatchEvent(new Event("input"));
    draw();

    expect(panes.steps.textContent).toContain("$nope isn't set by any action above");
    expect((panes.steps.querySelector("#f-url") as HTMLInputElement).classList).toContain("is-err");
  });

  it("inserts a picked variable at the caret and into the draft", () => {
    openStep("s2");
    const url = panes.steps.querySelector("#f-url") as HTMLInputElement;
    url.value = "https://api.test/t/";
    url.setSelectionRange(url.value.length, url.value.length);

    clickWithText(panes.steps, ".varchip", "$s1");

    expect(url.value).toBe("https://api.test/t/$s1");
    expect(store.currentStack()!.steps[1]).toMatchObject({ url: "https://api.test/t/$s1" });
  });

  it("names the result of a producing action, and nothing for the rest", () => {
    openStep("s2");
    expect(panes.steps.textContent).toContain("Later actions can use it as");
    expect((panes.steps.querySelector("#step-var") as HTMLInputElement).value).toBe("s2");

    openStep("s3");
    // A popup leaves nothing behind, so there is no variable to name — and
    // offering an empty box for one would be a lie.
    expect(panes.steps.querySelector("#step-var")).toBeNull();
    expect(panes.steps.querySelector(".outbox")?.textContent).toContain("No result");
  });

  it("renames the variable on blur, and the chips follow", () => {
    openStep("s2"); // nothing reads $s2, so this rename breaks nothing
    const name = panes.steps.querySelector("#step-var") as HTMLInputElement;

    name.value = "tenderJson";
    name.dispatchEvent(new Event("blur"));
    draw();

    expect(store.currentStack()!.steps[1].id).toBe("tenderJson");
    expect(texts(panes.steps, ".stephead .outchip")).toEqual(["→ $s1", "→ $tenderJson"]);
  });

  it("asks first when a rename would break a later action, and leaves it alone", () => {
    vi.stubGlobal("confirm", () => false);
    openStep("s1"); // the fetch below reads $s1

    const name = panes.steps.querySelector("#step-var") as HTMLInputElement;
    name.value = "tenderId";
    name.dispatchEvent(new Event("blur"));

    expect(store.currentStack()!.steps[0].id).toBe("s1");
  });

  it("refuses a variable name that could never be referenced", () => {
    openStep("s1");
    const name = panes.steps.querySelector("#step-var") as HTMLInputElement;

    name.value = "tender-id";
    name.dispatchEvent(new Event("blur"));

    expect(store.currentStack()!.steps[0].id).toBe("s1");
    expect(panes.steps.textContent).toContain("letters, digits and _ only");
  });

  it("reorders and deletes from the card's own tools", () => {
    const tool = (index: number, label: string) =>
      panes.steps.querySelectorAll(".step")[index].querySelector(
        `[aria-label="${label}"]`
      ) as HTMLButtonElement;

    expect(tool(0, "Move up").disabled).toBe(true);
    expect(tool(2, "Move down").disabled).toBe(true);

    tool(2, "Move up").click();
    draw();
    expect(texts(panes.steps, ".steptitle")[1]).toBe("Show popup (JSON)");

    tool(1, "Delete action").click();
    draw();
    expect(texts(panes.steps, ".steptitle")).toEqual(["Read element", "Fetch URL"]);
  });

  it("adds an action from the grouped type menu", () => {
    clickWithText(panes.steps, "button", "Add action");
    clickStepType(panes.steps, "Wait (fixed)");
    draw();

    expect(texts(panes.steps, ".steptitle").at(-1)).toBe("Wait (fixed)");
    expect(store.currentStep()).toMatchObject({ type: "wait", ms: 0 });
  });
});

describe("checking a stack against a real page", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    store.selectStack("show-tender");
    draw();
  });

  it("tests a selector in the page and says how many elements it hit", async () => {
    stubChromeTabs(() => ({ count: 3 }));
    openStep("s1");

    clickWithText(panes.steps, ".fieldrow button", "Test");
    await vi.waitFor(() => expect(probe.isBusy()).toBe(false));
    draw();

    expect(panes.steps.querySelector(".res")?.textContent).toContain("3 matches");
  });

  it("forgets the match count as soon as the selector is edited", async () => {
    stubChromeTabs(() => ({ count: 1 }));
    openStep("s1");
    clickWithText(panes.steps, ".fieldrow button", "Test");
    await vi.waitFor(() => expect(probe.isBusy()).toBe(false));
    draw();
    expect(panes.steps.querySelector(".res")).not.toBeNull();

    const selector = panes.steps.querySelector("#f-selector") as HTMLInputElement;
    selector.value = "#something_else";
    selector.dispatchEvent(new Event("input"));
    draw();

    expect(panes.steps.querySelector(".res")).toBeNull();
  });

  it("fills the field with whatever element the user clicks on the page", async () => {
    const tabs = stubChromeTabs((m) =>
      m.type === PICK_MESSAGE_TYPE ? { selector: ".js-pricedecor" } : {}
    );
    openStep("s1");

    clickWithText(panes.steps, ".fieldrow button", "Pick");
    await vi.waitFor(() => expect(probe.isBusy()).toBe(false));

    expect(tabs.sent.map((m) => m.type)).toEqual([PICK_MESSAGE_TYPE]);
    expect(store.currentStack()!.steps[0]).toMatchObject({ selector: ".js-pricedecor" });
    // The user was handed to the page and brought back.
    expect(tabs.activated).toEqual([7, 1]);
  });

  it("says what to do when the page has no content script", async () => {
    // sendMessage rejects when nothing is listening there, which means one
    // thing: that tab predates the extension loading.
    stubChromeTabs(() => undefined);
    openStep("s1");

    clickWithText(panes.steps, ".fieldrow button", "Pick");
    await vi.waitFor(() => expect(probe.isBusy()).toBe(false));
    draw();

    expect(panes.steps.querySelector(".troublebar")?.textContent).toContain("Reload the page");
  });
});

describe("building the user's example from scratch", () => {
  it("goes read → fetch → popupJson, wired by the variable chips, and saves", async () => {
    store.selectScope({ kind: "common" });
    draw();

    // A new stack, named.
    clickWithText(panes.stacks, "button", "New stack");
    draw();
    const name = panes.stacks.querySelector("#stack-name") as HTMLInputElement;
    name.value = "jsonShow";
    name.dispatchEvent(new Event("input"));
    draw();

    // Action 1: read the id off the page.
    clickWithText(panes.steps, "button", "Add action");
    clickStepType(panes.steps, "Read element");
    draw();
    const selector = panes.steps.querySelector("#f-selector") as HTMLInputElement;
    selector.value = "#tender_id";
    selector.dispatchEvent(new Event("input"));

    // Action 2: fetch with it, picking $text rather than typing it.
    clickWithText(panes.steps, "button", "Add action");
    clickStepType(panes.steps, "Fetch URL");
    draw();
    const url = panes.steps.querySelector("#f-url") as HTMLInputElement;
    url.value = "https://api.test/tenders/";
    url.dispatchEvent(new Event("input"));
    url.setSelectionRange(url.value.length, url.value.length);
    clickWithText(panes.steps, ".varchip", "$text");
    draw();

    // Action 3: show it.
    clickWithText(panes.steps, "button", "Add action");
    clickStepType(panes.steps, "Show popup (JSON)");
    draw();
    const body = panes.steps.querySelector("#f-body") as HTMLTextAreaElement;
    body.value = "$response";
    body.dispatchEvent(new Event("input"));

    await expect(store.save()).resolves.toEqual({ ok: true });

    // The names come from what each action holds, not from a counter — and the
    // stored shape is the same one a hand-written config has always used.
    const stack = store.getConfig().stacks.find((s) => s.name === "jsonShow")!;
    expect(stack.steps).toEqual([
      { id: "text", type: "readBySelector", selector: "#tender_id" },
      { id: "response", type: "fetchUrl", url: "https://api.test/tenders/$text" },
      { id: "s1", type: "popupJson", body: "$response" }
    ]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import * as probe from "../src/options/probe";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { renderSites } from "../src/options/sitesPane";
import { renderRoutines } from "../src/options/routinesPane";
import { renderSteps } from "../src/options/stepsPane";
import { PICK_MESSAGE_TYPE } from "../src/core/builderProtocol";
import { stubChromePermissions, stubChromeStorage, stubChromeTabs } from "./fakeChrome";

// The three columns, driven through the DOM rather than through the store — the
// nearest thing to clicking the builder that runs without a browser. Worth
// having: a pane that throws while rendering takes the whole page with it, and
// nothing else in the suite would notice.

const SEED = {
  schemaVersion: 2,
  sites: [{ id: "local", name: "dzo.lh", patterns: ["dzo.lh"] }],
  routines: [
    {
      // Common, deliberately: its own steps only ever need to be "three
      // actions, ending in a popup" for the tests that use it — read/click/
      // input selectors are site-only now (see core/stepMeta.ts), so this
      // stays with types Common may actually hold.
      id: "show-tender",
      name: "Show Tender",
      binding: { code: "Digit7", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [
        { id: "s1", type: "wait", ms: 10 },
        { id: "s2", type: "wait", ms: 10 },
        { id: "s3", type: "popupJson", title: "Tender", body: "$routines" }
      ]
    },
    {
      // The fetch pipeline lives on a site-scoped routine: Fetch URL is a
      // site-only action, so a Common routine may not hold one at all.
      id: "sync-tender",
      name: "Sync Tender",
      binding: { code: "Digit6", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "local",
      steps: [
        { id: "s1", type: "readBySelector", selector: "#tender_id", saveAs: "s1" },
        { id: "s2", type: "fetchUrl", url: "https://api.test/t/$s1", saveAs: "tender" },
        { id: "s3", type: "popupJson", title: "Tender", body: "$tender" }
      ]
    }
  ]
};

// One pane per section, as main.ts lays them out.
const panes = {
  sites: document.createElement("section"),
  routines: document.createElement("section"),
  steps: document.createElement("section")
};

function draw(): void {
  for (const pane of Object.values(panes)) pane.replaceChildren();
  renderSites(panes.sites);
  renderRoutines(panes.routines);
  renderSteps(panes.steps);
}

function hasAddAction(): boolean {
  return [...panes.steps.querySelectorAll("button")].some((b) =>
    b.textContent?.includes("Add action")
  );
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
  document.body.replaceChildren(panes.sites, panes.routines, panes.steps);
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
  it("lists Common first, then the sites, each with its routine count", () => {
    expect(texts(panes.sites, ".row .rowtitle")).toEqual(["Common", "dzo.lh"]);
    expect(texts(panes.sites, ".row .rowsub")[0]).toBe("Every site · 1 routine");
  });

  it("says which site claims the page the builder was opened from", () => {
    // dzo.lh owns the site-scoped Sync Tender routine.
    expect(texts(panes.sites, ".row .rowsub")[1]).toBe("1 routine · this page");
  });

  it("selects Common when clicked, and the Routines column follows", () => {
    clickWithText(panes.sites, ".row", "Common");
    draw();

    expect(store.getScope()).toEqual({ kind: "common" });
    expect(texts(panes.routines, ".routinename")).toEqual(["Show Tender"]);
  });

  it("shows the selected site's patterns as chips, and removes one", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();
    expect(texts(panes.sites, ".chip")).toEqual(["dzo.lh"]);

    (panes.sites.querySelector('[aria-label="Remove dzo.lh"]') as HTMLElement).click();

    expect(store.getConfig().sites[0].patterns).toEqual([]);
  });

  it("opens a site's settings right under its own row, not after Add site", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    const children = [...panes.sites.children];
    const rowIndex = children.findIndex((el) => el.textContent?.includes("dzo.lh"));
    const settingsIndex = children.findIndex((el) => el.classList.contains("settings"));
    const addIndex = children.findIndex((el) => el.classList.contains("btn-dashed"));

    expect(settingsIndex).toBeGreaterThan(rowIndex);
    expect(settingsIndex).toBeLessThan(addIndex);
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

  it("checks the auto-request box by default, and requests access on Enter", async () => {
    const fake = stubChromePermissions();
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    const box = panes.sites.querySelector("#site-auto-grant") as HTMLInputElement;
    expect(box.checked).toBe(true);

    const add = panes.sites.querySelector("#site-add-pattern") as HTMLInputElement;
    add.value = "dzo.lh/new";
    add.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    await vi.waitFor(() => expect(fake.requested).toEqual([["*://dzo.lh/*"]]));
  });

  it("unchecking auto-request adds the pattern without asking Chrome for it", async () => {
    const fake = stubChromePermissions();
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    const box = panes.sites.querySelector("#site-auto-grant") as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    draw();

    // Unchecked is a preference, not a grant state — it must not get written
    // as a flag the builder could later mistake for "access is in place".
    expect(store.getConfig().sites[0].autoGrant).toBe(false);

    const add = panes.sites.querySelector("#site-add-pattern") as HTMLInputElement;
    add.value = "dzo.lh/new";
    add.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(store.getConfig().sites[0].patterns).toContain("dzo.lh/new");
    // Nothing else in the builder can ask Chrome for this host now — the
    // standalone grant row was removed — so unchecking this is currently a
    // one-way door until the pattern is retyped.
    expect(fake.requested).toEqual([]);
  });

  it("re-checking auto-request clears the stored preference rather than writing true", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.patchSite("local", { autoGrant: false });
    draw();

    const box = panes.sites.querySelector("#site-auto-grant") as HTMLInputElement;
    expect(box.checked).toBe(false);

    box.checked = true;
    box.dispatchEvent(new Event("change"));

    expect(store.getConfig().sites[0].autoGrant).toBeUndefined();
  });

  it("offers the current host as a new site only when no site claims it", async () => {
    await store.init("https://example.com/", []);
    draw();
    expect(panes.sites.textContent).toContain("Add example.com");

    clickWithText(panes.sites, "button", "Add example.com");

    expect(store.getConfig().sites.at(-1)).toMatchObject({
      name: "example.com",
      patterns: ["example.com"]
    });
  });

  // The host is already a site, so the thing left to add is this section of it.
  it("offers this section of a host that is already a site", () => {
    expect(panes.sites.textContent).toContain("Add dzo.lh/tenders");
    clickWithText(panes.sites, "button", "Add dzo.lh/tenders");

    // One pattern: a path with no wildcard already covers its subtree.
    expect(store.getConfig().sites.at(-1)).toMatchObject({
      name: "/tenders",
      patterns: ["dzo.lh/tenders"]
    });
  });

  it("nests an area under its host, and opens it on its own routines", () => {
    store.addSite("/tenders", ["dzo.lh/tenders"]);
    store.addRoutine("Area routine");
    draw();

    expect(texts(panes.sites, ".row .rowtitle")).toEqual(["Common", "dzo.lh", "/tenders"]);
    expect(texts(panes.sites, ".arealist .row .rowtitle")).toEqual(["/tenders"]);
    // Both claim the page the builder was opened from, at their own level.
    expect(texts(panes.sites, ".row .rowsub").slice(1)).toEqual([
      "1 routine · this page",
      "1 routine · this page"
    ]);
    expect(texts(panes.routines, ".routinename")).toEqual(["Area routine"]);
  });

  it("offers nothing in particular once an area already claims the page", () => {
    store.addSite("/tenders", ["dzo.lh/tenders"]);
    draw();

    expect(panes.sites.textContent).toContain("Add site");
    expect(panes.sites.textContent).not.toContain("Add dzo.lh");
  });

  it("warns that a host's areas outlive it when the host is deleted", () => {
    store.addSite("/tenders", ["dzo.lh/tenders"]);
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    const asked: string[] = [];
    vi.stubGlobal("confirm", (message: string) => {
      asked.push(message);
      return false;
    });
    clickWithText(panes.sites, "button", "Delete site");

    expect(asked[0]).toContain("1 area (/tenders)");
    expect(store.getConfig().sites.map((s) => s.id)).toEqual(["local", "tenders"]);
  });

  it("names an area's settings card for what it is, and says what it beats", () => {
    store.addSite("/tenders", ["dzo.lh/tenders"]);
    draw();

    expect(texts(panes.sites, ".settings-head")).toEqual(["Area settings"]);
    expect(panes.sites.textContent).toContain("An area of dzo.lh");
  });

  it("badges only the rows that cannot fire yet, not the granted ones", async () => {
    stubChromePermissions(["*://dzo.lh/*"]); // Common not granted, dzo.lh is
    draw();

    await vi.waitFor(() =>
      expect(texts(panes.sites, ".row .outchip, .row .errchip")).toEqual(["Not granted"])
    );
  });

  it("spells out the pattern shapes a user can type, and the one they cannot, as one line", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    const legend = panes.sites.querySelector(".patternlegend")?.textContent;
    expect(legend).toContain("example.com — every page on this domain.");
    expect(legend).toContain("example.com/reports — this page, and everything under it.");
    expect(legend).toContain("*.example.com — every subdomain of it.");
    expect(legend).toContain("A pattern cannot claim every website — that is what Common is for.");
    expect(panes.sites.querySelectorAll(".patternlegend li")).toHaveLength(0);
  });

  it("says pressing Enter is what adds a typed pattern", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    expect(panes.sites.textContent).toContain("Write the domain, then press Enter to add it.");
  });

  it("refuses a pattern that claims every website, and says where those routines go", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    const add = panes.sites.querySelector("#site-add-pattern") as HTMLInputElement;
    add.value = "*";
    add.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(store.getConfig().sites[0].patterns).toEqual(["dzo.lh"]); // unchanged
    expect(panes.sites.textContent).toContain("claims every website");
    expect(panes.sites.textContent).toContain("use Common");
    expect(add.value).toBe("*"); // left in the box to be edited, not swallowed
  });
});

describe("the Routines column", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    // The builder boots with every routine closed, so these start with the click
    // the user makes first: opening the one they came to work on.
    store.selectRoutine("show-tender");
    draw();
  });

  it("shows each routine's name, action count and hotkey", () => {
    expect(texts(panes.routines, ".routinename")).toEqual(["Show Tender"]);
    expect(texts(panes.routines, ".card .rowsub")[0]).toBe("3 actions · on");
    expect(texts(panes.routines, ".keys kbd").at(-1)).toBe("7");
  });

  it("turns a routine off from the switch, without opening it", () => {
    (panes.routines.querySelector(".switch") as HTMLElement).click();
    draw();

    expect(store.getConfig().routines[0].enabled).toBe(false);
    expect(texts(panes.routines, ".card .rowsub")[0]).toBe("3 actions · off");
    // And the Actions column says the hotkey is doing nothing.
    expect(panes.steps.textContent).toContain("This routine is off");
  });

  it("edits the name in the card that is open, and the card keeps up", () => {
    const name = panes.routines.querySelector("#routine-name") as HTMLInputElement;
    name.value = "jsonShow";
    name.dispatchEvent(new Event("input"));
    draw();

    expect(texts(panes.routines, ".routinename")).toEqual(["jsonShow"]);
    expect(store.isDirty()).toBe(true);
  });

  it("moves a routine to a site through the Site dropdown, and follows it there", () => {
    const select = panes.routines.querySelector("#routine-site") as HTMLSelectElement;
    select.value = "local";
    select.dispatchEvent(new Event("change"));
    draw();

    expect(store.getConfig().routines[0].siteId).toBe("local");
    expect(store.getScope()).toEqual({ kind: "site", siteId: "local" });
    expect(texts(panes.routines, ".routinename")).toEqual(["Show Tender", "Sync Tender"]);
  });

  it("adds a routine, which arrives selected and with a free chord", () => {
    clickWithText(panes.routines, "button", "New routine");
    draw();

    expect(store.currentRoutine()?.name).toBe("New routine");
    expect(store.currentRoutine()?.binding.code).toBe("Digit1"); // ⌃⌥7 was the only one taken
    expect(texts(panes.routines, ".routinename")).toEqual(["Show Tender", "New routine"]);
  });

  // One chord, two meanings, one level apart: the site routine wins on its pages
  // and the common one everywhere else. Said out loud on both cards, and not as
  // a warning — this is what sites are for.
  it("says which of two routines one level apart wins, without calling it a clash", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.addRoutine("Local thing");
    store.patchRoutine(store.currentRoutine()!.id, { binding: SEED.routines[0].binding });
    draw();

    expect(panes.routines.querySelector(".conflict")).toBeNull();
    expect(panes.routines.querySelector(".keys.is-conflict")).toBeNull();
    // The site card (the narrower, winning routine) gets no note of its own —
    // it already behaves exactly as it describes.
    expect(panes.routines.querySelector(".precedence")).toBeNull();

    // From Common (the loser here), the pair is said out loud.
    store.selectScope({ kind: "common" });
    draw();
    expect(panes.routines.querySelector(".precedence")?.textContent).toContain(
      "Local thing (dzo.lh) runs instead"
    );
  });

  it("still warns when the two routines are on the same site", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    const one = store.addRoutine("One");
    const two = store.addRoutine("Two");
    const chord = { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false };
    store.patchRoutine(two.id, { binding: chord });
    store.patchRoutine(one.id, { binding: chord });
    draw();

    expect(panes.routines.querySelector(".conflict")?.textContent).toContain("Same hotkey as Two");
    expect(panes.routines.querySelector(".keys.is-conflict")).not.toBeNull();
    store.selectRoutine(one.id);
    draw();
    expect(panes.routines.textContent).toContain("Record a different hotkey");
  });

  it("points at Common from a site, since those routines work here too", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    expect(panes.routines.textContent).toContain("+1 more from Common");
    clickWithText(panes.routines, ".row", "more from Common");
    expect(store.getScope()).toEqual({ kind: "common" });
  });
});

// Ten routines with ten editors open is not a list of hotkeys, it is a wall. The
// column stays a list until a card is asked for.
describe("the Routines column on arrival", () => {
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    draw();
  });

  it("opens no card, and no editor with it", () => {
    expect(texts(panes.routines, ".routinename")).toEqual(["Show Tender"]);
    expect(panes.routines.querySelector(".cardbody")).toBeNull();
    expect(panes.routines.querySelector(".routinepick")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the one that is clicked, and closes it when clicked again", () => {
    (panes.routines.querySelector(".routinepick") as HTMLElement).click();
    draw();
    expect(panes.routines.querySelector("#routine-name")).not.toBeNull();

    (panes.routines.querySelector(".routinepick") as HTMLElement).click();
    draw();
    expect(panes.routines.querySelector("#routine-name")).toBeNull();
  });
});

describe("the Actions column", () => {
  beforeEach(() => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.selectRoutine("sync-tender");
    draw();
  });

  it("opens with the hotkey that starts the routine", () => {
    expect(panes.steps.querySelector(".triggerline")?.textContent).toContain("When you press");
    expect(panes.steps.querySelector(".triggerline")?.textContent).toContain("dzo.lh");
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
    // The chip shows the Save as name, which the seed spells out, not the id.
    expect(texts(panes.steps, ".stephead .outchip")).toEqual(["→ $s1", "→ $tender"]);
  });

  it("chips an action whose field names a variable nothing produces", () => {
    store.patchStep("s2", { url: "https://api.test/t/$nope" });
    draw();

    expect(texts(panes.steps, ".stephead .errchip")).toEqual(["$nope undefined"]);
  });

  it("opens one card at a time, and closes the open one", () => {
    // An open routine is a pipeline with every card shut, so the first click
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

  // A fetchUrl step calls a host of its own, which the worker refuses until
  // that host is granted — and granting it here must not turn api.test into
  // a site KeyRoutine runs on.
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

    expect(store.currentRoutine()!.steps[0]).toMatchObject({ selector: "#other_id" });
  });

  it("offers only the variables that exist by the time the action runs", () => {
    openStep("s2");

    const offered = texts(panes.steps, ".varchip");
    expect(offered).toContain("$s1"); // the read before it
    expect(offered).toContain("$url"); // a builtin
    expect(offered).toContain("$runToken");
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
    expect(store.currentRoutine()!.steps[1]).toMatchObject({ url: "https://api.test/t/$s1" });
  });

  it("names the result of a producing action, and nothing for the rest", () => {
    openStep("s2");
    expect(panes.steps.textContent).toContain("Later actions can use it as");
    expect(panes.steps.textContent).toContain("Save as");
    expect((panes.steps.querySelector("#step-var") as HTMLInputElement).value).toBe("tender");

    openStep("s3");
    // A popup leaves nothing behind, so there is no variable to name — and
    // offering an empty box for one would be a lie.
    expect(panes.steps.querySelector("#step-var")).toBeNull();
    expect(panes.steps.querySelector(".outbox")?.textContent).toContain("No result");
  });

  it("renames the result on blur, and the chips follow — while the id stays put", () => {
    // The popup below reads $tender, so the rename is confirmed rather than
    // silent; the next test is the one that declines.
    vi.stubGlobal("confirm", () => true);
    openStep("s2");
    const name = panes.steps.querySelector("#step-var") as HTMLInputElement;

    name.value = "tenderJson";
    name.dispatchEvent(new Event("blur"));
    draw();

    expect(store.currentRoutine()!.steps[1]).toMatchObject({ id: "s2", saveAs: "tenderJson" });
    expect(texts(panes.steps, ".stephead .outchip")).toEqual(["→ $s1", "→ $tenderJson"]);
  });

  it("asks first when a rename would break a later action, and leaves it alone", () => {
    vi.stubGlobal("confirm", () => false);
    openStep("s1"); // the fetch below reads $s1

    const name = panes.steps.querySelector("#step-var") as HTMLInputElement;
    name.value = "tenderId";
    name.dispatchEvent(new Event("blur"));

    expect(store.currentRoutine()!.steps[0].id).toBe("s1");
  });

  it("refuses a variable name that could never be referenced", () => {
    openStep("s1");
    const name = panes.steps.querySelector("#step-var") as HTMLInputElement;

    name.value = "tender-id";
    name.dispatchEvent(new Event("blur"));

    expect(store.currentRoutine()!.steps[0].id).toBe("s1");
    expect(panes.steps.textContent).toContain("letters, digits and _ only");
  });

  it("reorders and deletes from the card's own tools", () => {
    const tool = (index: number, label: string) =>
      panes.steps.querySelectorAll(".step")[index].querySelector(
        `[aria-label="${label}"]`
      ) as HTMLButtonElement;

    expect(tool(0, "Move up").disabled).toBe(true);
    expect(tool(2, "Move down").disabled).toBe(true);
    // The popup is where the routine ends, so neither arrow may leave an action
    // standing behind it: it cannot climb, and the action above cannot pass it.
    expect(tool(2, "Move up").disabled).toBe(true);
    expect(tool(1, "Move down").disabled).toBe(true);

    tool(1, "Move up").click();
    draw();
    expect(texts(panes.steps, ".steptitle")).toEqual([
      "Fetch URL",
      "Read element",
      "Show popup (JSON)"
    ]);

    tool(1, "Delete action").click();
    draw();
    expect(texts(panes.steps, ".steptitle")).toEqual(["Fetch URL", "Show popup (JSON)"]);
  });

  it("ends the pipeline at a popup instead of asking what comes next", () => {
    // The seeded routine finishes with Show popup (JSON) — the answer the hotkey
    // was pressed for, so there is nothing sensible to add after it.
    expect(hasAddAction()).toBe(false);
    expect(panes.steps.textContent).toContain("Show popup (JSON) ends the routine");

    // And the way back is the one the note names.
    store.deleteStep("s3");
    draw();
    expect(hasAddAction()).toBe(true);
  });

  it("adds an action from the grouped type menu", () => {
    // Adding happens at the end, and this routine ends in a popup.
    store.deleteStep("s3");
    draw();

    clickWithText(panes.steps, "button", "Add action");
    clickStepType(panes.steps, "Wait (fixed)");
    draw();

    expect(texts(panes.steps, ".steptitle").at(-1)).toBe("Wait (fixed)");
    expect(store.currentStep()).toMatchObject({ type: "wait", ms: 0 });
  });
});

describe("checking a routine against a real page", () => {
  beforeEach(() => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.selectRoutine("sync-tender");
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
    expect(store.currentRoutine()!.steps[0]).toMatchObject({ selector: ".js-pricedecor" });
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

describe("a Common routine and the actions it may not hold", () => {
  // A fresh Common routine, so the menu is reachable: Show Tender ends with a
  // popup, and nothing may follow one.
  beforeEach(() => {
    store.selectScope({ kind: "common" });
    store.addRoutine("Plain");
    draw();
  });

  it("offers Fetch URL disabled, with the reason where the help would be", () => {
    clickWithText(panes.steps, "button", "Add action");

    const entry = [...panes.steps.querySelectorAll(".type-menu button")].find(
      (b) => b.querySelector(".name")?.textContent === "Fetch URL"
    ) as HTMLButtonElement;

    expect(entry.disabled).toBe(true);
    expect(entry.querySelector(".note")?.textContent).toContain("scoped to a site");

    // And clicking it adds nothing.
    entry.click();
    expect(store.currentRoutine()!.steps).toEqual([]);
  });

  it("leaves every other action alone", () => {
    clickWithText(panes.steps, "button", "Add action");

    const enabled = [...panes.steps.querySelectorAll(".type-menu button")].filter(
      (b) => !(b as HTMLButtonElement).disabled
    );
    // Eleven types; six are site-only now (Fetch URL plus the five
    // selector-based actions — see siteOnly in core/stepMeta.ts), leaving
    // five Common can actually offer: wait, the two popups, and the two
    // navigate actions.
    expect(enabled).toHaveLength(5);
  });

  it("flags a fetch that is already there, from an older config", () => {
    // Pushed into the draft directly: the menu would not allow it, which is
    // exactly the config an older version could have written.
    const routine = store.currentRoutine()!;
    store.getConfig().routines.find((s) => s.id === routine.id)!.steps.push({ id: "leak", type: "fetchUrl",
      url: "https://api.test/x", saveAs: "leak" });
    openStep("leak");

    expect(texts(panes.steps, ".stephead .errchip")).toContain("Needs a site");
    expect(texts(panes.steps, ".cardbody .errtext").join(" ")).toContain("scoped to a site");
  });
});

describe("the Site dropdown and a routine that cannot be Common", () => {
  it("disables the Common option and says why", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.selectRoutine("sync-tender");
    draw();

    const select = panes.routines.querySelector("#routine-site") as HTMLSelectElement;
    const common = [...select.options].find((o) => o.value === "")!;
    expect(common.disabled).toBe(true);
    expect(panes.routines.textContent).toContain("cannot move to Common");
  });

  it("leaves it selectable for a routine with nothing site-only in it", () => {
    store.selectScope({ kind: "site", siteId: "local" });
    store.addRoutine("Plain");
    draw();

    const select = panes.routines.querySelector("#routine-site") as HTMLSelectElement;
    expect([...select.options].find((o) => o.value === "")!.disabled).toBe(false);
  });
});

describe("building the user's example from scratch", () => {
  it("goes read → fetch → popupJson, wired by the variable chips, and saves", async () => {
    // In a site's column: the fetch in the middle is not offered in Common.
    store.selectScope({ kind: "site", siteId: "local" });
    draw();

    // A new routine, named.
    clickWithText(panes.routines, "button", "New routine");
    draw();
    const name = panes.routines.querySelector("#routine-name") as HTMLInputElement;
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

    // The names come from what each action holds, not from a counter, and the
    // ids are generated and say nothing — the two are separate things now.
    const routine = store.getConfig().routines.find((s) => s.name === "jsonShow")!;
    expect(routine.steps).toMatchObject([
      { type: "readBySelector", selector: "#tender_id", saveAs: "text" },
      { type: "fetchUrl", url: "https://api.test/tenders/$text", saveAs: "response" },
      { type: "popupJson", body: "$response" }
    ]);
    expect(routine.steps[2]).not.toHaveProperty("saveAs"); // a popup holds nothing
    for (const step of routine.steps) expect(step.id).toMatch(/^[a-z0-9]{16}$/);
  });
});

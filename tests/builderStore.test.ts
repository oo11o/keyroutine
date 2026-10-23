import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as store from "../src/options/store";
import { CONFIG_KEY, clearCache, loadConfig } from "../src/core/configStore";
import { stubChromeStorage, type FakeStorage } from "./fakeChrome";

// The builder's draft: what the three columns read, what the buttons mutate, and
// what Save is allowed to let through. Tested without the DOM — the panes are
// thin renderers over this.

const SEED = {
  schemaVersion: 2,
  sites: [
    { id: "local", name: "dzo.lh", patterns: ["dzo.lh"] },
    { id: "test", name: "test", patterns: ["https://test.dzo.com.ua/*"] }
  ],
  routines: [
    {
      id: "copy-id",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#tender_id", saveAs: "s1" }]
    },
    {
      id: "local-sync",
      name: "Sync (local)",
      binding: { code: "Digit3", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "local",
      steps: []
    }
  ]
};

let storage: FakeStorage;

async function open(url: string | null = null, vars: string[] = []) {
  storage = stubChromeStorage({ [CONFIG_KEY]: structuredClone(SEED) });
  await store.init(url, vars);
}

beforeEach(() => {
  clearCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("opening the builder", () => {
  it("starts on Common when the page belongs to no site", async () => {
    await open("https://example.com/");

    expect(store.getScope()).toEqual({ kind: "common" });
    expect(store.routinesInScope().map((s) => s.id)).toEqual(["copy-id"]);
  });

  it("starts on the site of the page it was opened from", async () => {
    // "Make this work here" is how a routine usually starts, so the column opens
    // where the user already is.
    await open("http://dzo.lh/tenders/new");

    expect(store.getScope()).toEqual({ kind: "site", siteId: "local" });
    expect(store.routinesInScope().map((s) => s.id)).toEqual(["local-sync"]);
  });

  it("opens nothing, so the Routines column reads as a list until one is picked", async () => {
    await open();

    expect(store.currentRoutine()).toBeNull();
    expect(store.currentStep()).toBeNull();
  });

  it("closes the open routine when it is picked again", async () => {
    await open();
    store.selectRoutine("copy-id");
    expect(store.currentRoutine()?.id).toBe("copy-id");

    store.toggleRoutine("copy-id");
    expect(store.currentRoutine()).toBeNull();

    store.toggleRoutine("copy-id");
    expect(store.currentRoutine()?.id).toBe("copy-id");
  });

  it("opens nothing of another scope's routines when the scope changes", async () => {
    await open();
    store.selectRoutine("copy-id");

    store.selectScope({ kind: "site", siteId: "local" });

    expect(store.currentRoutine()).toBeNull();
  });

  it("counts the routines per scope for the column's badges", async () => {
    await open();

    expect(store.routineCount({ kind: "common" })).toBe(1);
    expect(store.routineCount({ kind: "site", siteId: "local" })).toBe(1);
    expect(store.routineCount({ kind: "site", siteId: "test" })).toBe(0);
  });

  it("is not dirty before anything is touched", async () => {
    await open();

    expect(store.isDirty()).toBe(false);
  });
});

describe("adding things", () => {
  it("scopes a new routine to the site that is open", async () => {
    await open("http://dzo.lh/x");

    const routine = store.addRoutine("Logout");

    expect(routine.siteId).toBe("local");
    expect(store.isDirty()).toBe(true);
  });

  it("gives a new routine a chord nothing in its scope is using", async () => {
    await open(); // Common already uses ⌃⌥1

    expect(store.addRoutine("A").binding.code).toBe("Digit2");
    expect(store.addRoutine("B").binding.code).toBe("Digit3");
  });

  it("gives a routine an opaque id that owes nothing to its name", async () => {
    await open();

    const first = store.addRoutine("Log out");
    const second = store.addRoutine("Log out");

    // Two routines called the same thing: ids are generated, so there is no
    // collision to resolve and no slug to read anything into.
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^[a-z0-9]{8}$/);
    expect(first.id).not.toContain("log");
  });

  it("keeps a routine's id when its name changes", async () => {
    await open();
    const routine = store.addRoutine("Log out");

    store.patchRoutine(routine.id, { name: "Sign out, actually" });

    expect(store.getConfig().routines.find((r) => r.id === routine.id)?.name).toBe(
      "Sign out, actually"
    );
  });

  it("names a producing step after what it holds, and keeps it unique", async () => {
    await open();
    store.selectRoutine("copy-id");

    // The name is what a later action reads the result by ($response), so it
    // comes from the type rather than from a counter — while the id behind it
    // is generated and says nothing.
    store.addStep("fetchUrl");
    expect(store.currentStep()).toMatchObject({ saveAs: "response" });
    store.addStep("fetchUrl");
    expect(store.currentStep()).toMatchObject({ saveAs: "response2" });
    store.addStep("readBySelector");
    expect(store.currentStep()).toMatchObject({ saveAs: "text" });
    expect(store.currentStep()?.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("gives an action that holds nothing no name at all", async () => {
    await open();
    store.selectRoutine("copy-id");

    store.addStep("popup");

    expect(store.currentStep()).not.toHaveProperty("saveAs");
    expect(store.currentStep()?.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("fills a new step with its required fields blank and nothing else", async () => {
    await open();
    store.selectRoutine("copy-id");

    store.addStep("readBySelector");

    expect(store.currentStep()).toMatchObject({ type: "readBySelector", selector: "", saveAs: "text" });
    expect(store.currentStep()!.id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("selects a new site so its routines can be added straight away", async () => {
    await open();

    const site = store.addSite("Prozorro", ["*://*.prozorro.gov.ua/*", "  "]);

    expect(site.patterns).toEqual(["*://*.prozorro.gov.ua/*"]); // the blank row is dropped
    expect(store.getScope()).toEqual({ kind: "site", siteId: site.id });
  });
});

describe("editing steps", () => {
  it("drops an optional field that was cleared, rather than storing an empty one", async () => {
    await open();
    store.selectRoutine("copy-id");
    store.addStep("popup");
    const popup = store.currentStep()!.id;
    store.patchStep(popup, { title: "Tender" });
    expect(store.currentStep()).toMatchObject({ title: "Tender" });

    store.patchStep(popup, { title: "" });

    // The handlers read `timeoutMs ?? DEFAULT`, which an empty string defeats.
    expect("title" in (store.currentStep() as object)).toBe(false);
  });

  it("refuses to save an action queued behind a popup", async () => {
    await open();
    store.selectRoutine("copy-id");
    // The builder offers no way to do this — the Add action row is gone once a
    // routine ends in a popup — but an imported config can still arrive like it.
    store.addStep("popup");
    store.patchStep(store.currentStep()!.id, { body: "done" });
    store.addStep("wait");

    const result = await store.save();

    expect(result.ok).toBe(false);
    expect((result as { problems: { message: string }[] }).problems[0].message).toContain(
      "has to be the last action"
    );
  });

  it("moves a step, and refuses to move it off either end", async () => {
    await open();
    store.selectRoutine("copy-id");
    store.addStep("popup");
    const added = store.currentStep()!.id;
    const ids = () => store.currentRoutine()!.steps.map((s) => s.id);

    store.moveStep(added, -1);
    expect(ids()).toEqual([added, "s1"]);

    store.moveStep(added, -1);
    expect(ids()).toEqual([added, "s1"]);

    store.moveStep("s1", 1);
    expect(ids()).toEqual([added, "s1"]);
  });

  it("keeps a sensible selection after a delete", async () => {
    await open();
    store.selectRoutine("copy-id");
    store.addStep("popup");
    const added = store.currentStep()!.id;
    store.selectStep(added);

    store.deleteStep(added);

    expect(store.currentStep()?.id).toBe("s1");
  });

  it("names the later steps a variable rename would break", async () => {
    await open();
    store.selectRoutine("copy-id");
    store.addStep("fetchUrl");
    const fetcher = store.currentStep()!.id;
    store.patchStep(fetcher, { url: "https://api.test/t/$s1" });

    // "s1" is the seed read action's name, which the fetch above reads.
    const breaks = store.renamesBreak(store.currentRoutine()!, "s1");

    expect(breaks).toMatchObject([{ stepId: fetcher }]);
    expect(breaks[0].message).toContain("$s1");
  });

  it("finds nothing to break when no template mentions the step", async () => {
    await open();
    store.selectRoutine("copy-id");

    expect(store.renamesBreak(store.currentRoutine()!, "s1")).toEqual([]);
  });
});

describe("chord conflicts", () => {
  // A common routine and a site routine on one chord is precedence, not a clash:
  // the site's wins on its pages, the common one everywhere else. Reported as
  // a relation so the builder can say which way round it goes, and left out of
  // chordConflicts so nothing scolds the user for it.
  it("treats a common routine and a site routine on one chord as an override", async () => {
    await open();
    store.patchRoutine("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toEqual([]);
    expect(store.chordRelations()).toEqual([
      {
        routineId: "copy-id",
        conflicts: [],
        overrides: [],
        overriddenBy: [
          { id: "local-sync", name: "Sync (local)", siteId: "local", siteName: "dzo.lh" }
        ]
      },
      {
        routineId: "local-sync",
        conflicts: [],
        overrides: [{ id: "copy-id", name: "Copy Tender", siteId: null, siteName: "Common" }],
        overriddenBy: []
      }
    ]);
  });

  it("ranks an area of a site above the site itself", async () => {
    await open();
    store.addSite("/tenders", ["dzo.lh/tenders"]);
    store.patchRoutine("copy-id", { siteId: "tenders" });
    store.patchRoutine("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toEqual([]);
    const relations = store.chordRelations();
    expect(relations.find((r) => r.routineId === "copy-id")?.overrides).toEqual([
      { id: "local-sync", name: "Sync (local)", siteId: "local", siteName: "dzo.lh" }
    ]);
  });

  it("warns when two routines on one site share a chord — one of them is dead", async () => {
    await open();
    store.patchRoutine("copy-id", { siteId: "local" });
    store.patchRoutine("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts().map((p) => p.routineId).sort()).toEqual(["copy-id", "local-sync"]);
  });

  it("warns when two common routines share a chord", async () => {
    await open();
    store.patchRoutine("local-sync", {
      siteId: null,
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toHaveLength(2);
  });

  it("says nothing about a routine whose site no longer exists — it applies nowhere", async () => {
    await open();
    store.patchRoutine("local-sync", {
      siteId: "gone",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordRelations()).toEqual([]);
  });

  it("does not warn about two sites whose patterns never meet", async () => {
    await open();
    store.patchRoutine("copy-id", { siteId: "test" });
    store.patchRoutine("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false }
    });

    expect(store.chordConflicts()).toEqual([]);
  });

  it("does not warn when one of the two is disabled", async () => {
    await open();
    store.patchRoutine("local-sync", {
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: false
    });

    expect(store.chordConflicts()).toEqual([]);
  });

  it("flags a chord with no modifier, which would swallow an ordinary keypress", async () => {
    expect(store.isBareKey({ code: "KeyK", ctrl: false, alt: false, shift: true, meta: false })).toBe(true);
    expect(store.isBareKey({ code: "KeyK", ctrl: false, alt: true, shift: false, meta: false })).toBe(false);
  });
});

describe("deleting a site", () => {
  it("can keep its routines as common ones", async () => {
    await open();

    store.deleteSite("local", true);

    expect(store.getConfig().sites.map((s) => s.id)).toEqual(["test"]);
    expect(store.getConfig().routines.find((s) => s.id === "local-sync")?.siteId).toBeNull();
  });

  it("can take its routines with it", async () => {
    await open();

    store.deleteSite("local", false);

    expect(store.getConfig().routines.map((s) => s.id)).toEqual(["copy-id"]);
  });

  it("falls back to Common, so the columns cannot point at a site that is gone", async () => {
    await open("http://dzo.lh/x");

    store.deleteSite("local", true);

    expect(store.getScope()).toEqual({ kind: "common" });
  });
});

describe("saving", () => {
  it("writes the draft to storage and clears the dirty flag", async () => {
    await open();
    const added = store.addRoutine("Logout");

    await expect(store.save()).resolves.toEqual({ ok: true });

    expect(store.isDirty()).toBe(false);
    const stored = storage.data[CONFIG_KEY] as { routines: { id: string }[] };
    expect(stored.routines.map((s) => s.id)).toContain(added.id);
  });

  it("makes the saved config what the hotkey path reads next", async () => {
    await open();
    const added = store.addRoutine("Logout");
    await store.save();

    // The content script reads the same store; this is why a Save is live on the
    // next keystroke instead of the next reload.
    await expect(loadConfig()).resolves.toMatchObject({
      routines: expect.arrayContaining([expect.objectContaining({ id: added.id })])
    });
  });

  it("refuses a step with a required field left blank, and stores nothing", async () => {
    await open();
    store.selectRoutine("copy-id");
    store.addStep("fetchUrl"); // url is blank

    const result = await store.save();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.some((p) => /URL/.test(p.message))).toBe(true);
    expect((storage.data[CONFIG_KEY] as typeof SEED).routines).toHaveLength(2);
  });

  it("refuses a $var nothing in the routine produces, naming the step and field", async () => {
    await open();
    store.selectRoutine("copy-id");
    store.addStep("fetchUrl");
    const fetcher = store.currentStep()!.id;
    store.patchStep(fetcher, { url: "https://api.test/t/$tender" });

    const result = await store.save();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0].message).toContain("$tender");
    expect(result.problems[0].message).toContain("url");
    expect(result.problems[0].stepId).toBe(fetcher);
  });

  // On the site-scoped routine, here and below: a fetch is a site-only action.
  it("accepts the same $var once the step it comes from exists", async () => {
    await open();
    store.selectScope({ kind: "site", siteId: "local" });
    store.selectRoutine("local-sync");
    store.addStep("readBySelector");
    store.patchStep(store.currentStep()!.id, { selector: "#tender_id", saveAs: "tender" });
    store.addStep("fetchUrl");
    store.patchStep(store.currentStep()!.id, { url: "https://api.test/t/$tender" });

    await expect(store.save()).resolves.toEqual({ ok: true });
  });

  it("accepts a variable that exists and refuses one that does not", async () => {
    await open(null, ["runToken"]);
    store.selectScope({ kind: "site", siteId: "local" });
    store.selectRoutine("local-sync");
    store.addStep("fetchUrl");
    store.patchStep(store.currentStep()!.id, { url: "https://api.test/?run=$runToken" });
    await expect(store.save()).resolves.toEqual({ ok: true });

    store.patchStep(store.currentStep()!.id, { url: "https://api.test/?run=$nope" });
    await expect(store.save()).resolves.toMatchObject({ ok: false });
  });

  it("refuses an imported site that claims every website", async () => {
    await open();

    const result = store.replaceDraft({
      schemaVersion: 2,
      sites: [{ id: "all", name: "Everything", patterns: ["*"] }],
      routines: []
    });

    expect(result.ok).toBe(false);
    expect((result as { problems: { message: string }[] }).problems[0].message).toContain(
      "claims every website"
    );
  });

  it("refuses an imported fetch in a Common routine at the door, draft untouched", async () => {
    await open();
    const before = store.exportJson();

    const result = store.replaceDraft({
      schemaVersion: 2,
      sites: [],
      routines: [
        {
          id: "leaky",
          name: "Leaky",
          binding: { code: "Digit5", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: [{ id: "s1", type: "fetchUrl", url: "https://api.test/x", saveAs: "s1" }]
        }
      ]
    });
    expect(result.ok).toBe(false);
    expect((result as { problems: { message: string }[] }).problems[0].message).toContain(
      "only available in a routine scoped to a site"
    );
    expect(store.exportJson()).toBe(before); // nothing was replaced
  });

  // Save still checks it: storage written by an older version, or a draft
  // edited another way, must not slip past.
  it("refuses to save a fetch that is already sitting in a Common routine", async () => {
    await open();
    store.selectScope({ kind: "common" });
    store.selectRoutine("copy-id");
    store.getConfig().routines.find((s) => s.id === "copy-id")!.steps.push({ id: "leak", type: "fetchUrl",
      url: "https://api.test/x", saveAs: "leak" });

    const saved = await store.save();
    expect(saved.ok).toBe(false);
    expect((saved as { problems: { message: string }[] }).problems[0].message).toContain(
      "only available in a routine scoped to a site"
    );
  });

  it("will not move a routine holding a fetch to Common", async () => {
    await open();
    store.selectScope({ kind: "site", siteId: "local" });
    store.selectRoutine("local-sync");
    store.addStep("fetchUrl");
    const fetcher = store.currentStep()!.id;
    store.patchStep(fetcher, { url: "https://api.test/x" });

    expect(store.blocksCommon("local-sync").map((s) => s.id)).toEqual([fetcher]);
    // A routine with nothing site-only in it is free to move.
    expect(store.blocksCommon("copy-id")).toEqual([]);
  });
});

describe("import and export", () => {
  it("round-trips, so an export can be pasted straight back", async () => {
    await open();
    const json = store.exportJson();

    expect(store.replaceDraft(JSON.parse(json))).toEqual({ ok: true });
    expect(store.exportJson()).toBe(json);
  });

  it("migrates a hand-written v1 config on the way in", async () => {
    await open();

    const result = store.replaceDraft({
      schemaVersion: 1,
      routines: [
        {
          id: "old",
          name: "Old",
          binding: { code: "Digit4", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: [{ id: "s1", type: "readBySelector", selector: "#x", saveAs: "s1" }]
        }
      ]
    });

    expect(result).toEqual({ ok: true });
    expect(store.getConfig().routines[0].siteId).toBeNull();
    expect(store.getConfig().sites).toEqual([]);
  });

  it("refuses a broken import without touching the draft", async () => {
    await open();

    const result = store.replaceDraft({ routines: [{ id: "x" }] });

    expect(result.ok).toBe(false);
    expect(store.getConfig().routines.map((s) => s.id)).toEqual(["copy-id", "local-sync"]);
  });
});

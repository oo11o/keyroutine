import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { resolveRoutine, type Route } from "../src/content/routineResolver";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { formatRoutineList } from "../src/page/builtins";
import { stubChromeStorage } from "./fakeChrome";

// One chord, two meanings — the point of sites. Both routines below are bound to
// ⌃⌥9; which one fires depends only on the URL of the page.
const CONFIG = {
  schemaVersion: 2,
  sites: [
    { id: "local", name: "dzo.lh", patterns: ["dzo.lh"] },
    { id: "test", name: "test", patterns: ["https://test.dzo.com.ua/*"] },
    // A path in the pattern makes this a URL-level site rather than a domain
    // one — it applies on one page of a host the "local" site already covers.
    { id: "new-tender", name: "new tender form", patterns: ["dzo.lh/tenders/new"] }
  ],
  routines: [
    {
      id: "sync-common",
      name: "Sync (anywhere)",
      binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#x", saveAs: "s1" }]
    },
    {
      id: "sync-test",
      name: "Sync (test)",
      binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "test",
      steps: [{ id: "s1", type: "readBySelector", selector: "#y", saveAs: "s1" }]
    },
    {
      id: "local-only",
      name: "Local only",
      binding: { code: "Digit8", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "local",
      steps: [{ id: "s1", type: "readBySelector", selector: "#z", saveAs: "s1" }]
    },
    {
      id: "new-tender-only",
      name: "New tender form only",
      binding: { code: "Digit9", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      siteId: "new-tender",
      steps: [{ id: "s1", type: "readBySelector", selector: "#w", saveAs: "s1" }]
    }
  ]
};

// jsdom lets location be redefined, which is the only way to test a resolver
// that reads location.href.
function onPage(url: string) {
  vi.stubGlobal("location", { href: url });
}

function keydown(code: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { code, ctrlKey: true, altKey: true });
}

beforeEach(() => {
  document.body.innerHTML = "";
  stubChromeStorage({ [CONFIG_KEY]: CONFIG });
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("site scoping", () => {
  it("runs the site's routine when the URL matches, not the common one on the same chord", async () => {
    onPage("https://test.dzo.com.ua/tenders/1");

    expect(await resolveRoutine(keydown("Digit9"))).toMatchObject({ routine: { id: "sync-test" } });
  });

  it("falls back to the common routine on a site that has no routine for that chord", async () => {
    onPage("https://example.com/");

    expect(await resolveRoutine(keydown("Digit9"))).toMatchObject({ routine: { id: "sync-common" } });
  });

  it("does not leak one site's chord to another site", async () => {
    onPage("https://test.dzo.com.ua/x");

    // ⌃⌥8 belongs to dzo.lh only.
    expect(await resolveRoutine(keydown("Digit8"))).toBeNull();
  });

  it("runs a site's own chord on its own site", async () => {
    onPage("http://dzo.lh/tenders/new");

    expect(await resolveRoutine(keydown("Digit8"))).toMatchObject({ routine: { id: "local-only" } });
  });

  it("carries only the applicable routines, so the $routines cheatsheet is honest", async () => {
    onPage("http://dzo.lh/x");

    const route = (await resolveRoutine(keydown("Digit8"))) as Route;

    expect(route.sections.flatMap((s) => s.routines.map((st) => st.id))).toEqual([
      "local-only",
      "sync-common"
    ]);
    // The popup lists what works here, not every chord ever configured.
    expect(formatRoutineList(route.sections)).not.toMatch(/Sync \(test\)/);
  });
});

describe("a URL-level site alongside a domain-level one", () => {
  it("lets both apply on the page they overlap on", async () => {
    onPage("http://dzo.lh/tenders/new");

    // The old first-matching-site rule made this impossible: "dzo.lh" would win
    // and the page-specific site's chords would never fire.
    expect(await resolveRoutine(keydown("Digit8"))).toMatchObject({ routine: { id: "local-only" } });
    expect(await resolveRoutine(keydown("Digit9"))).toMatchObject({ routine: { id: "new-tender-only" } });
  });

  it("does not apply the URL-level routine elsewhere on the same domain", async () => {
    onPage("http://dzo.lh/tenders/list");

    expect(await resolveRoutine(keydown("Digit9"))).toMatchObject({ routine: { id: "sync-common" } });
  });
});

describe("the cheatsheet's three tiers", () => {
  it("groups what applies here as everywhere, then this domain, then this URL", async () => {
    onPage("http://dzo.lh/tenders/new");

    const route = (await resolveRoutine(keydown("Digit8"))) as Route;

    // The cheatsheet reads in precedence order, so the routine this chord will
    // actually run here is the first one on the list.
    expect(route.sections.map((s) => [s.level, s.label])).toEqual([
      ["url", "This URL · new tender form"],
      ["domain", "This domain · dzo.lh"],
      ["common", "Everywhere"]
    ]);

    const text = formatRoutineList(route.sections);
    expect(text.indexOf("This URL")).toBeLessThan(text.indexOf("This domain"));
    expect(text.indexOf("This domain")).toBeLessThan(text.indexOf("Everywhere"));
    expect(text).toContain("New tender form only");
  });

  it("drops the tiers that do not apply, rather than showing them empty", async () => {
    onPage("https://example.com/");

    const route = (await resolveRoutine(keydown("Digit9"))) as Route;

    expect(route.sections.map((s) => s.level)).toEqual(["common"]);
  });
});

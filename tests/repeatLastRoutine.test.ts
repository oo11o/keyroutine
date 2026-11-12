import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runRoutine, StepError } from "../src/content/runner";
import { executeRoutine } from "../src/content/routineExecutor";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { SCHEMA_VERSION, type Routine, type Config, type Site } from "../src/core/schema";
import { stubChromeStorage } from "./fakeChrome";

// jsdom lets location be redefined — same seam siteScoping.test.ts uses —
// but repeatLastRoutine also reads location.hostname, so both are stubbed.
function onPage(url: string) {
  vi.stubGlobal("location", { href: url, hostname: new URL(url).hostname });
}

function binding(code: string) {
  return { code, ctrl: true, alt: true, shift: false, meta: false };
}

// inputToSelector is site-only (see core/stepMeta.ts), so every routine used
// below to produce an observable effect needs a real site to belong to.
const SITE: Site = { id: "site-a", name: "A", host: "shop.example", includeSubdomains: false };

const EMPTY: Config = { schemaVersion: SCHEMA_VERSION, sites: [], routines: [] };

beforeEach(() => {
  document.body.innerHTML = '<input id="out">';
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("repeatLastRoutine", () => {
  it("refuses when nothing has run on this host yet", async () => {
    stubChromeStorage({ [CONFIG_KEY]: EMPTY });
    onPage("https://shop.example/");

    const repeat: Routine = {
      id: "rep",
      name: "Repeat",
      binding: binding("Digit1"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "repeatLastRoutine" }],
      pages: []
    };
    await expect(runRoutine(repeat)).rejects.toThrow(/nothing has run/);
  });

  it("re-runs whatever executeRoutine last dispatched on this host", async () => {
    const fill: Routine = {
      id: "fill",
      name: "Fill",
      binding: binding("Digit2"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "inputToSelector", selector: "#out", value: "filled" }],
      pages: []
    };
    const repeat: Routine = {
      id: "rep",
      name: "Repeat",
      binding: binding("Digit1"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "repeatLastRoutine" }],
      pages: []
    };
    stubChromeStorage({ [CONFIG_KEY]: { ...EMPTY, sites: [SITE], routines: [fill, repeat] } });
    onPage("https://shop.example/");

    await executeRoutine(fill, [{ level: "domain", label: "This domain · A", routines: [fill] }]);
    expect((document.querySelector("#out") as HTMLInputElement).value).toBe("filled");

    (document.querySelector("#out") as HTMLInputElement).value = "";
    await executeRoutine(repeat, [{ level: "common", label: "Everywhere", routines: [repeat] }]);
    expect((document.querySelector("#out") as HTMLInputElement).value).toBe("filled");
  });

  it("never remembers a routine that itself holds a repeat step, so Repeat cannot chase itself", async () => {
    const fill: Routine = {
      id: "fill",
      name: "Fill",
      binding: binding("Digit2"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "inputToSelector", selector: "#out", value: "filled" }],
      pages: []
    };
    const repeat: Routine = {
      id: "rep",
      name: "Repeat",
      binding: binding("Digit1"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "repeatLastRoutine" }],
      pages: []
    };
    const storage = stubChromeStorage({
      [CONFIG_KEY]: { ...EMPTY, sites: [SITE], routines: [fill, repeat] }
    });
    onPage("https://shop.example/");

    await executeRoutine(fill, [{ level: "domain", label: "This domain · A", routines: [fill] }]);
    await executeRoutine(repeat, [{ level: "common", label: "Everywhere", routines: [repeat] }]);

    expect(storage.data.lastRoutineByHost).toEqual({ "shop.example": "fill" });
  });

  it("refuses when the remembered routine no longer applies to this page", async () => {
    const scoped: Routine = {
      id: "scoped",
      name: "Scoped",
      binding: binding("Digit2"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "inputToSelector", selector: "#out", value: "filled" }],
      pages: []
    };
    const storage = stubChromeStorage({
      [CONFIG_KEY]: { ...EMPTY, sites: [SITE], routines: [scoped] }
    });
    onPage("https://shop.example/");
    await executeRoutine(scoped, [{ level: "domain", label: "This domain · A", routines: [scoped] }]);
    expect(storage.data.lastRoutineByHost).toEqual({ "shop.example": "scoped" });

    // The routine is disabled after the fact — it no longer applies here,
    // even though the host still matches and is still remembered.
    storage.data[CONFIG_KEY] = { ...EMPTY, sites: [SITE], routines: [{ ...scoped, enabled: false }] };
    clearCache();

    const repeat: Routine = {
      id: "rep",
      name: "Repeat",
      binding: binding("Digit1"),
      enabled: true,
      siteId: "site-a",
      steps: [{ id: "s1", type: "repeatLastRoutine" }],
      pages: []
    };
    const err = await runRoutine(repeat).catch((e) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as StepError).message).toMatch(/no longer applies/);
  });
});

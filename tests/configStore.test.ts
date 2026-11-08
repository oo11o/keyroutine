import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CONFIG_KEY,
  isParsed,
  loadConfig,
  parseConfig,
  saveConfig,
  seedIfEmpty,
  clearCache
} from "../src/core/configStore";
import { SCHEMA_VERSION } from "../src/core/schema";
import { stubChromeStorage } from "./fakeChrome";

const V1 = {
  schemaVersion: 1,
  routines: [
    {
      id: "copy-id",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "readBySelector", selector: "#tender_id" }]
    }
  ]
};

function routineWith(steps: unknown[]): unknown {
  return {
    schemaVersion: 2,
    sites: [],
    routines: [
      {
        id: "logout",
        name: "logoutLogin",
        binding: { code: "Digit8", ctrl: true, alt: true, shift: false, meta: false },
        enabled: true,
        steps
      }
    ]
  };
}

describe("a config saved before a step type was retired", () => {
  it("reads a config that still calls routines stacks, and writes the new key", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [],
      stacks: [
        {
          id: "old",
          name: "Old",
          binding: { code: "Digit4", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: [{ id: "s1", type: "popup", body: "hi" }]
        }
      ]
    });

    expect(config.routines.map((r) => r.id)).toEqual(["old"]);
  });

  it("prefers the new key when a config somehow carries both", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [],
      routines: [
        {
          id: "new",
          name: "New",
          binding: { code: "Digit5", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: [{ id: "s1", type: "popup", body: "hi" }]
        }
      ],
      stacks: []
    });

    expect(config.routines.map((r) => r.id)).toEqual(["new"]);
  });

  it("takes an action's old id as its Save as name, so $<old id> keeps resolving", () => {
    // Before the split, an action's id *was* the name its result was read
    // back by. A config written then references $s1, and must go on working.
    const config = parsed(
      routineWith([
        { id: "s1", type: "readBySelector", selector: "#tender_id" },
        { id: "s2", type: "popup", body: "$s1" }
      ])
    );

    expect(config.routines[0].steps[0]).toMatchObject({ id: "s1", saveAs: "s1" });
  });

  it("leaves a name the config already spells out alone", () => {
    const config = parsed(
      routineWith([{ id: "abc12345", type: "fetchUrl", url: "https://api.test/x", saveAs: "order" }])
    );

    expect(config.routines[0].steps[0]).toMatchObject({ id: "abc12345", saveAs: "order" });
  });

  it("gives an action that holds nothing no name, whatever its id", () => {
    const config = parsed(routineWith([{ id: "s1", type: "popup", body: "hi" }]));

    expect(config.routines[0].steps[0]).not.toHaveProperty("saveAs");
  });

  it("still refuses a type that never existed", () => {
    expect(errorsOf(routineWith([{ id: "s1", type: "teleport", selector: "#x" }]))).toEqual([
      'routine "logout" step #1: unknown step type "teleport"'
    ]);
  });
});

function errorsOf(raw: unknown): string[] {
  const result = parseConfig(raw);
  return isParsed(result) ? [] : result.errors;
}

function parsed(raw: unknown) {
  const result = parseConfig(raw);
  if (!isParsed(result)) throw new Error(`expected a parse, got: ${result.errors.join("; ")}`);
  return result.config;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearCache();
});

describe("parseConfig — migration", () => {
  it("reads a schemaVersion 1 config as v2 with no sites and every routine common", () => {
    const config = parsed(V1);

    expect(config.schemaVersion).toBe(SCHEMA_VERSION);
    expect(config.sites).toEqual([]);
    expect(config.routines[0].siteId).toBeNull();
    expect(config.routines[0].steps).toEqual([
      { id: "s1", type: "readBySelector", selector: "#tender_id", saveAs: "s1" }
    ]);
  });

  it("keeps sites and scoping when they are already there", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [{ id: "local", name: "dzo.lh", patterns: ["dzo.lh"] }],
      routines: [{ ...V1.routines[0], siteId: "local" }]
    });

    expect(config.sites[0].host).toBe("dzo.lh");
    expect(config.routines[0].siteId).toBe("local");
    // A bare-domain legacy pattern has nothing to narrow a page to.
    expect(config.routines[0].pages).toEqual([]);
  });

  it("defaults an absent enabled to true, and only an explicit false disables", () => {
    const { enabled } = parsed({ routines: [{ ...V1.routines[0], enabled: undefined }] }).routines[0];
    expect(enabled).toBe(true);
    expect(parsed({ routines: [{ ...V1.routines[0], enabled: false }] }).routines[0].enabled).toBe(false);
  });

  it("falls back to the id when a routine has no name, so nothing is nameless in the builder", () => {
    expect(parsed({ routines: [{ ...V1.routines[0], name: "" }] }).routines[0].name).toBe("copy-id");
  });

});

describe("parseConfig — ids a config does not supply", () => {
  // Ids are opaque now (see core/ids.ts), and a config written by hand or
  // exported from somewhere else commonly has none at all — that is not a
  // reason to refuse it. A missing id is generated instead of flagged, the
  // same way a missing name falls back to something usable.
  it("generates a 16-character id for a routine, a step and a site that have none", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [{ name: "dzo.lh", patterns: ["dzo.lh"] }],
      routines: [
        {
          name: "No ids here",
          binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: [{ type: "popup", body: "hi" }]
        }
      ]
    });

    expect(config.routines[0].id).toMatch(/^[a-z0-9]{16}$/);
    expect(config.routines[0].steps[0].id).toMatch(/^[a-z0-9]{16}$/);
    expect(config.sites[0].id).toMatch(/^[a-z0-9]{16}$/);
  });

  it("keeps an id the config does supply, rather than generating over it", () => {
    const config = parsed(
      routineWith([{ id: "kept", type: "popup", body: "hi" }])
    );

    expect(config.routines[0].steps[0].id).toBe("kept");
  });

  it("a generated step id still gets a saveAs for a producer — the id is unreadable but not unused", () => {
    const config = parsed(
      routineWith([{ type: "readBySelector", selector: "#x" }])
    );

    const step = config.routines[0].steps[0] as { id: string; saveAs?: string };
    expect(step.saveAs).toBe(step.id); // no saveAs supplied, so it falls back to the (generated) id
  });

  it("names a routine and a site after the generated id too, when neither is given", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [{ patterns: ["dzo.lh"] }],
      routines: [
        {
          binding: { code: "Digit2", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          steps: []
        }
      ]
    });

    expect(config.routines[0].name).toBe(config.routines[0].id);
    expect(config.sites[0].name).toBe(config.sites[0].id);
  });
});

describe("parseConfig — a config from a newer build", () => {
  // v2→v3 reads forward (see "migration" above); this is the one direction
  // that is not supported — an old build must not silently misread fields it
  // has never heard of (routine.pages, site.host) as if they meant nothing.
  it("refuses rather than guessing, when schemaVersion is newer than this build understands", () => {
    expect(errorsOf({ schemaVersion: SCHEMA_VERSION + 1, routines: [] })).toEqual([
      `this config was saved by a newer version of KeyRoutine (schema ${SCHEMA_VERSION + 1}) — update the extension to open it`
    ]);
  });

  it("still accepts the current and every older schemaVersion", () => {
    expect(errorsOf({ schemaVersion: SCHEMA_VERSION, routines: [] })).toEqual([]);
    expect(errorsOf(V1)).toEqual([]);
  });
});

describe("parseConfig — merging sites that share a host", () => {
  // Two legacy sites at one host with neither a bare-domain pattern of its
  // own (no "parent" for migrateLegacySites to nest either under) used to
  // migrate into two separate v3 sites for the same host — the exact bug
  // reported against a real exported config. mergeDuplicateHostSites (run
  // unconditionally after parsing) now collapses them into one regardless of
  // how they got here, so this also heals a config already in v3 shape.
  it("merges two orphan legacy sites for the same host into one, keeping each routine's own pages", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [
        { id: "tenders", name: "stage /tenders", patterns: ["stage.dzo.com.ua/tenders"] },
        { id: "plans", name: "stage /plans", patterns: ["stage.dzo.com.ua/plans"] }
      ],
      routines: [
        { ...V1.routines[0], id: "a", siteId: "tenders" },
        { ...V1.routines[0], id: "b", siteId: "plans" }
      ]
    });

    expect(config.sites.map((s) => s.host)).toEqual(["stage.dzo.com.ua"]);
    const survivor = config.sites[0].id;
    expect(config.routines.map((r) => r.siteId)).toEqual([survivor, survivor]);
    expect(config.routines.find((r) => r.id === "a")?.pages).toEqual(["/tenders"]);
    expect(config.routines.find((r) => r.id === "b")?.pages).toEqual(["/plans"]);
  });

  it("merges two already-v3 sites that share a host, favouring one with subdomains included", () => {
    const config = parsed({
      schemaVersion: 3,
      sites: [
        { id: "a", name: "stage", host: "stage.dzo.com.ua", includeSubdomains: false },
        { id: "b", name: "stage (2)", host: "stage.dzo.com.ua", includeSubdomains: true }
      ],
      routines: [
        { ...V1.routines[0], id: "r1", siteId: "a", pages: ["/tenders"] },
        { ...V1.routines[0], id: "r2", siteId: "b", pages: ["/plans"] }
      ]
    });

    expect(config.sites).toHaveLength(1);
    expect(config.sites[0]).toMatchObject({ id: "b", includeSubdomains: true });
    expect(config.routines.map((r) => r.siteId)).toEqual(["b", "b"]);
    expect(config.routines.find((r) => r.id === "r1")?.pages).toEqual(["/tenders"]);
  });

  it("leaves sites with distinct hosts untouched", () => {
    const config = parsed({
      schemaVersion: 3,
      sites: [
        { id: "a", name: "a", host: "a.test", includeSubdomains: false },
        { id: "b", name: "b", host: "b.test", includeSubdomains: false }
      ],
      routines: []
    });

    expect(config.sites.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("parseConfig — errors as data", () => {
  it("never throws on rubbish", () => {
    expect(errorsOf(null)).toEqual(["the config is not an object"]);
    expect(errorsOf("nope")).toEqual(["the config is not an object"]);
    expect(errorsOf({ schemaVersion: 1 })).toEqual(['no "routines" array in the config']);
    expect(errorsOf({ routines: "not an array" })).toEqual(['no "routines" array in the config']);
  });

  it("names an unknown step type", () => {
    const raw = { routines: [{ ...V1.routines[0], steps: [{ id: "s1", type: "openUrl", url: "x" }] }] };
    // The v0.5 rename: an old config says openUrl and there is no such handler.
    expect(errorsOf(raw)).toContain('routine "copy-id" step #1: unknown step type "openUrl"');
  });

  it("names a required field that is missing or blank", () => {
    const raw = { routines: [{ ...V1.routines[0], steps: [{ id: "s1", type: "readBySelector", saveAs: "s1" }] }] };
    expect(errorsOf(raw)).toContain('routine "copy-id" step #1: readBySelector needs "Element"');

    const blank = { routines: [{ ...V1.routines[0], steps: [{ id: "s1", type: "fetchUrl", url: "", saveAs: "s1" }] }] };
    expect(errorsOf(blank)).toContain('routine "copy-id" step #1: fetchUrl needs "URL"');
  });

  it("enforces the shared wait cap, so a form and a handler cannot disagree", () => {
    const raw = { routines: [{ ...V1.routines[0], steps: [{ id: "s1", type: "wait", ms: 600000 }] }] };
    expect(errorsOf(raw)).toContain('routine "copy-id" step #1: "Milliseconds" is capped at 30000, got 600000');
  });

  it("rejects a saveAs name that could never be referenced", () => {
    // $my-var would resolve as $my, because core/context.ts's regex is \w+.
    const raw = {
      routines: [{ ...V1.routines[0], steps: [{ id: "s1", type: "readBySelector", selector: "#x", saveAs: "my-var" }] }]
    };
    expect(errorsOf(raw)).toContain(
      'routine "copy-id" step #1: "my-var" may only use letters, digits and _ — it is read back as $my-var'
    );
  });

  it("rejects duplicate step ids, because $<id> would silently mean the later one", () => {
    const raw = {
      routines: [
        {
          ...V1.routines[0],
          steps: [
            { id: "s1", type: "readBySelector", selector: "#a", saveAs: "s1" },
            { id: "s1", type: "readBySelector", selector: "#b", saveAs: "s1" }
          ]
        }
      ]
    };
    expect(errorsOf(raw)).toContain('routine "copy-id": two steps share the id "s1"');
  });

  it("rejects duplicate routine ids, because resume finds its routine by id", () => {
    expect(errorsOf({ routines: [V1.routines[0], V1.routines[0]] })).toContain(
      'two routines share the id "copy-id"'
    );
  });

  it("rejects a routine scoped to a site that does not exist", () => {
    expect(errorsOf({ routines: [{ ...V1.routines[0], siteId: "ghost" }], sites: [] })).toContain(
      'routine "copy-id": unknown site "ghost"'
    );
  });

  it("rejects a site with no usable pattern, which would match nothing", () => {
    const raw = { routines: [], sites: [{ id: "s", name: "s", patterns: ["", "  "] }] };
    expect(errorsOf(raw)).toContain('site "s": needs a domain');
  });

  it("rejects a binding with no key code", () => {
    expect(errorsOf({ routines: [{ ...V1.routines[0], binding: {} }] })).toContain(
      'routine "copy-id": binding needs a key code'
    );
  });

  it("coerces missing modifiers to false rather than refusing the routine", () => {
    const config = parsed({ routines: [{ ...V1.routines[0], binding: { code: "Digit1", ctrl: true } }] });
    expect(config.routines[0].binding).toEqual({
      code: "Digit1",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false
    });
  });

  it("collects every problem, so the builder can list them all at once", () => {
    const raw = {
      routines: [
        { ...V1.routines[0], steps: [{ id: "s1", type: "readBySelector", saveAs: "s1" }] },
        { id: "b", binding: { code: "Digit2" }, steps: [{ id: "s1", type: "nope" }] }
      ]
    };
    expect(errorsOf(raw).length).toBeGreaterThan(1);
  });
});

describe("loadConfig", () => {
  it("reads the stored config", async () => {
    stubChromeStorage({ [CONFIG_KEY]: V1 });

    const config = await loadConfig();

    expect(config.routines.map((s) => s.id)).toEqual(["copy-id"]);
  });

  it("treats storage with nothing in it as an empty config, not an error", async () => {
    stubChromeStorage();

    await expect(loadConfig()).resolves.toMatchObject({ routines: [], sites: [] });
  });

  it("throws on a stored config that cannot be parsed, so the resolver can report it", async () => {
    stubChromeStorage({ [CONFIG_KEY]: { routines: [{ id: "a" }] } });

    await expect(loadConfig()).rejects.toThrow(/binding/);
  });

  it("reads storage once however many keystrokes follow", async () => {
    stubChromeStorage({ [CONFIG_KEY]: V1 });
    const get = vi.spyOn(chrome.storage.local, "get");

    await loadConfig();
    await loadConfig();
    await loadConfig();

    // The old resolver fetched routines.json on every single keydown.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves a saved config without going back to storage", async () => {
    stubChromeStorage();
    await loadConfig(); // caches the empty config

    await saveConfig({ schemaVersion: SCHEMA_VERSION, routines: [], sites: [] });

    await expect(loadConfig()).resolves.toMatchObject({ routines: [] });
  });
});

describe("seedIfEmpty", () => {
  function stubBundle(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body)))
    );
  }

  it("copies the bundled config into storage on a fresh install", async () => {
    const storage = stubChromeStorage();
    // A v1 config migrates every routine to Common (siteId: null) — V1's own
    // readBySelector step is site-only, so a seed-shaped fixture needs a
    // Common-safe step type instead, same as every other Common fixture in
    // this file.
    stubBundle({ ...V1, routines: [{ ...V1.routines[0], steps: [{ id: "s1", type: "wait", ms: 10 }] }] });

    const config = await seedIfEmpty();

    expect(config.routines.map((s) => s.id)).toEqual(["copy-id"]);
    expect(storage.data[CONFIG_KEY]).toMatchObject({ schemaVersion: SCHEMA_VERSION });
  });

  it("leaves an existing config alone, so an update cannot overwrite the user's routines", async () => {
    const mine = { schemaVersion: 2, routines: [], sites: [] };
    const storage = stubChromeStorage({ [CONFIG_KEY]: mine });
    stubBundle(V1);

    await seedIfEmpty();

    expect(storage.data[CONFIG_KEY]).toBe(mine);
  });

  it("stores nothing when the bundled seed is unreachable", async () => {
    const storage = stubChromeStorage();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));

    await expect(seedIfEmpty()).resolves.toMatchObject({ routines: [] });
    expect(storage.data[CONFIG_KEY]).toBeUndefined();
  });

  it("stores nothing when the bundled seed is broken — that is a shipping bug, not the user's", async () => {
    const storage = stubChromeStorage();
    stubBundle({ routines: [{ id: "a", binding: {} }] });

    await seedIfEmpty();

    expect(storage.data[CONFIG_KEY]).toBeUndefined();
  });

  it("stores nothing when the bundled seed holds a site-only action in a Common routine", async () => {
    const storage = stubChromeStorage();
    stubBundle({
      schemaVersion: 2,
      sites: [],
      routines: [
        {
          id: "leak",
          name: "Leak",
          binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
          enabled: true,
          siteId: null,
          steps: [{ id: "s1", type: "fetchUrl", url: "https://api.test/x" }]
        }
      ]
    });

    await expect(seedIfEmpty()).resolves.toMatchObject({ routines: [] });
    expect(storage.data[CONFIG_KEY]).toBeUndefined();
  });
});

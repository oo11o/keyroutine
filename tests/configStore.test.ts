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
      steps: [{ id: "s1", type: "copyBySelector", selector: "#tender_id" }]
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
  it("rewrites typeToSelector as inputToSelector rather than failing the lot", () => {
    const config = parsed(
      routineWith([
        { id: "s1", type: "clickBySelector", selector: "#go" },
        { id: "s6", type: "typeToSelector", selector: '[name="email"]', value: "b" }
      ])
    );

    expect(config.routines[0].steps).toEqual([
      { id: "s1", type: "clickBySelector", selector: "#go" },
      { id: "s6", type: "inputToSelector", selector: '[name="email"]', value: "b" }
    ]);
  });

  it("turns waitForSelector into a pause of the budget it was given", () => {
    const config = parsed(
      routineWith([{ id: "s3", type: "waitForSelector", selector: "#late", timeoutMs: 800 }])
    );

    expect(config.routines[0].steps).toEqual([{ id: "s3", type: "wait", ms: 800 }]);
  });

  it("uses the old default when that step carried no timeout, and stays within the cap", () => {
    expect(parsed(routineWith([{ id: "s3", type: "waitForSelector", selector: "#late" }])).routines[0].steps)
      .toEqual([{ id: "s3", type: "wait", ms: 5000 }]);
    expect(
      parsed(routineWith([{ id: "s3", type: "waitForSelector", selector: "#late", timeoutMs: 600_000 }]))
        .routines[0].steps
    ).toEqual([{ id: "s3", type: "wait", ms: 30_000 }]);
  });

  it("rewrites copyBySelector as a plain read, since nothing writes the clipboard now", () => {
    const config = parsed(
      routineWith([{ id: "s1", type: "copyBySelector", selector: "#tender_id" }])
    );

    // Lossy on purpose: the element is still read (and referenceable as
    // $s1), but the clipboard write is a capability KeyRoutine no longer has.
    expect(config.routines[0].steps).toEqual([
      { id: "s1", type: "readBySelector", selector: "#tender_id", saveAs: "s1" }
    ]);
  });

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
          steps: [{ id: "s1", type: "popup", body: "$stacks" }]
        }
      ]
    });

    expect(config.routines.map((r) => r.id)).toEqual(["old"]);
    // The cheatsheet builtin was renamed with everything else.
    expect(config.routines[0].steps[0]).toMatchObject({ body: "$routines" });
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
    // copyBySelector is gone; migrateStep rewrites it to the plain read.
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

    expect(config.sites[0].patterns).toEqual(["dzo.lh"]);
    expect(config.routines[0].siteId).toBe("local");
  });

  it("defaults an absent enabled to true, and only an explicit false disables", () => {
    const { enabled } = parsed({ routines: [{ ...V1.routines[0], enabled: undefined }] }).routines[0];
    expect(enabled).toBe(true);
    expect(parsed({ routines: [{ ...V1.routines[0], enabled: false }] }).routines[0].enabled).toBe(false);
  });

  it("falls back to the id when a routine has no name, so nothing is nameless in the builder", () => {
    expect(parsed({ routines: [{ ...V1.routines[0], name: "" }] }).routines[0].name).toBe("copy-id");
  });

  // Variables lost their "secret_" prefix in 0.7. A config written before then
  // is rewritten on the way in, so the hotkey it describes keeps working.
  it("drops the old secret_ prefix from every field a $var may appear in", () => {
    const config = parsed({
      routines: [
        {
          ...V1.routines[0],
          steps: [
            { id: "s1", type: "fetchUrl", url: "https://api.test/?run=$secret_runToken", saveAs: "s1" },
            { id: "s2", type: "inputToSelector", selector: "#f", value: "$secret_pass" },
            { id: "s3", type: "popup", title: "t", body: "$secret_runToken and $s1" }
          ]
        }
      ]
    });

    expect(config.routines[0].steps).toMatchObject([
      { url: "https://api.test/?run=$runToken" },
      { value: "$pass" },
      { body: "$runToken and $s1" }
    ]);
  });

  it("leaves an escaped dollar and an ordinary variable alone", () => {
    const config = parsed({
      routines: [
        {
          ...V1.routines[0],
          steps: [{ id: "s1", type: "popup", body: "$$secret_runToken costs $s1" }]
        }
      ]
    });

    expect(config.routines[0].steps[0]).toMatchObject({ body: "$$secret_runToken costs $s1" });
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
    expect(errorsOf(raw)).toContain('site "s": needs at least one URL pattern');
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
    stubBundle(V1);

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
});

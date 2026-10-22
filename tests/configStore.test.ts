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
  stacks: [
    {
      id: "copy-id",
      name: "Copy Tender",
      binding: { code: "Digit1", ctrl: true, alt: true, shift: false, meta: false },
      enabled: true,
      steps: [{ id: "s1", type: "copyBySelector", selector: "#tender_id" }]
    }
  ]
};

function stackWith(steps: unknown[]): unknown {
  return {
    schemaVersion: 2,
    sites: [],
    stacks: [
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
      stackWith([
        { id: "s1", type: "clickBySelector", selector: "#go" },
        { id: "s6", type: "typeToSelector", selector: '[name="email"]', value: "b" }
      ])
    );

    expect(config.stacks[0].steps).toEqual([
      { id: "s1", type: "clickBySelector", selector: "#go" },
      { id: "s6", type: "inputToSelector", selector: '[name="email"]', value: "b" }
    ]);
  });

  it("turns waitForSelector into a pause of the budget it was given", () => {
    const config = parsed(
      stackWith([{ id: "s3", type: "waitForSelector", selector: "#late", timeoutMs: 800 }])
    );

    expect(config.stacks[0].steps).toEqual([{ id: "s3", type: "wait", ms: 800 }]);
  });

  it("uses the old default when that step carried no timeout, and stays within the cap", () => {
    expect(parsed(stackWith([{ id: "s3", type: "waitForSelector", selector: "#late" }])).stacks[0].steps)
      .toEqual([{ id: "s3", type: "wait", ms: 5000 }]);
    expect(
      parsed(stackWith([{ id: "s3", type: "waitForSelector", selector: "#late", timeoutMs: 600_000 }]))
        .stacks[0].steps
    ).toEqual([{ id: "s3", type: "wait", ms: 30_000 }]);
  });

  it("still refuses a type that never existed", () => {
    expect(errorsOf(stackWith([{ id: "s1", type: "teleport", selector: "#x" }]))).toEqual([
      'stack "logout" step #1: unknown step type "teleport"'
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
  it("reads a schemaVersion 1 config as v2 with no sites and every stack common", () => {
    const config = parsed(V1);

    expect(config.schemaVersion).toBe(SCHEMA_VERSION);
    expect(config.sites).toEqual([]);
    expect(config.stacks[0].siteId).toBeNull();
    expect(config.stacks[0].steps).toEqual([
      { id: "s1", type: "copyBySelector", selector: "#tender_id" }
    ]);
  });

  it("keeps sites and scoping when they are already there", () => {
    const config = parsed({
      schemaVersion: 2,
      sites: [{ id: "local", name: "dzo.lh", patterns: ["dzo.lh"] }],
      stacks: [{ ...V1.stacks[0], siteId: "local" }]
    });

    expect(config.sites[0].patterns).toEqual(["dzo.lh"]);
    expect(config.stacks[0].siteId).toBe("local");
  });

  it("defaults an absent enabled to true, and only an explicit false disables", () => {
    const { enabled } = parsed({ stacks: [{ ...V1.stacks[0], enabled: undefined }] }).stacks[0];
    expect(enabled).toBe(true);
    expect(parsed({ stacks: [{ ...V1.stacks[0], enabled: false }] }).stacks[0].enabled).toBe(false);
  });

  it("falls back to the id when a stack has no name, so nothing is nameless in the builder", () => {
    expect(parsed({ stacks: [{ ...V1.stacks[0], name: "" }] }).stacks[0].name).toBe("copy-id");
  });

  // Variables lost their "secret_" prefix in 0.7. A config written before then
  // is rewritten on the way in, so the hotkey it describes keeps working.
  it("drops the old secret_ prefix from every field a $var may appear in", () => {
    const config = parsed({
      stacks: [
        {
          ...V1.stacks[0],
          steps: [
            { id: "s1", type: "fetchUrl", url: "https://api.test/?run=$secret_runToken" },
            { id: "s2", type: "inputToSelector", selector: "#f", value: "$secret_pass" },
            { id: "s3", type: "popup", title: "t", body: "$secret_runToken and $s1" }
          ]
        }
      ]
    });

    expect(config.stacks[0].steps).toMatchObject([
      { url: "https://api.test/?run=$runToken" },
      { value: "$pass" },
      { body: "$runToken and $s1" }
    ]);
  });

  it("leaves an escaped dollar and an ordinary variable alone", () => {
    const config = parsed({
      stacks: [
        {
          ...V1.stacks[0],
          steps: [{ id: "s1", type: "popup", body: "$$secret_runToken costs $s1" }]
        }
      ]
    });

    expect(config.stacks[0].steps[0]).toMatchObject({ body: "$$secret_runToken costs $s1" });
  });
});

describe("parseConfig — errors as data", () => {
  it("never throws on rubbish", () => {
    expect(errorsOf(null)).toEqual(["the config is not an object"]);
    expect(errorsOf("nope")).toEqual(["the config is not an object"]);
    expect(errorsOf({ schemaVersion: 1 })).toEqual(['no "stacks" array in the config']);
    expect(errorsOf({ stacks: "not an array" })).toEqual(['no "stacks" array in the config']);
  });

  it("names an unknown step type", () => {
    const raw = { stacks: [{ ...V1.stacks[0], steps: [{ id: "s1", type: "openUrl", url: "x" }] }] };
    // The v0.5 rename: an old config says openUrl and there is no such handler.
    expect(errorsOf(raw)).toContain('stack "copy-id" step #1: unknown step type "openUrl"');
  });

  it("names a required field that is missing or blank", () => {
    const raw = { stacks: [{ ...V1.stacks[0], steps: [{ id: "s1", type: "copyBySelector" }] }] };
    expect(errorsOf(raw)).toContain('stack "copy-id" step #1: copyBySelector needs "Element"');

    const blank = { stacks: [{ ...V1.stacks[0], steps: [{ id: "s1", type: "fetchUrl", url: "" }] }] };
    expect(errorsOf(blank)).toContain('stack "copy-id" step #1: fetchUrl needs "URL"');
  });

  it("enforces the shared wait cap, so a form and a handler cannot disagree", () => {
    const raw = { stacks: [{ ...V1.stacks[0], steps: [{ id: "s1", type: "wait", ms: 600000 }] }] };
    expect(errorsOf(raw)).toContain('stack "copy-id" step #1: "Milliseconds" is capped at 30000, got 600000');
  });

  it("rejects a saveAs name that could never be referenced", () => {
    // $my-var would resolve as $my, because core/context.ts's regex is \w+.
    const raw = {
      stacks: [{ ...V1.stacks[0], steps: [{ id: "s1", type: "readBySelector", selector: "#x", saveAs: "my-var" }] }]
    };
    expect(errorsOf(raw)).toContain(
      'stack "copy-id" step #1: "Also available as" may only use letters, digits and _'
    );
  });

  it("rejects duplicate step ids, because $<id> would silently mean the later one", () => {
    const raw = {
      stacks: [
        {
          ...V1.stacks[0],
          steps: [
            { id: "s1", type: "readBySelector", selector: "#a" },
            { id: "s1", type: "readBySelector", selector: "#b" }
          ]
        }
      ]
    };
    expect(errorsOf(raw)).toContain('stack "copy-id": two steps share the id "s1"');
  });

  it("rejects duplicate stack ids, because resume finds its stack by id", () => {
    expect(errorsOf({ stacks: [V1.stacks[0], V1.stacks[0]] })).toContain(
      'two stacks share the id "copy-id"'
    );
  });

  it("rejects a stack scoped to a site that does not exist", () => {
    expect(errorsOf({ stacks: [{ ...V1.stacks[0], siteId: "ghost" }], sites: [] })).toContain(
      'stack "copy-id": unknown site "ghost"'
    );
  });

  it("rejects a site with no usable pattern, which would match nothing", () => {
    const raw = { stacks: [], sites: [{ id: "s", name: "s", patterns: ["", "  "] }] };
    expect(errorsOf(raw)).toContain('site "s": needs at least one URL pattern');
  });

  it("rejects a binding with no key code", () => {
    expect(errorsOf({ stacks: [{ ...V1.stacks[0], binding: {} }] })).toContain(
      'stack "copy-id": binding needs a key code'
    );
  });

  it("coerces missing modifiers to false rather than refusing the stack", () => {
    const config = parsed({ stacks: [{ ...V1.stacks[0], binding: { code: "Digit1", ctrl: true } }] });
    expect(config.stacks[0].binding).toEqual({
      code: "Digit1",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false
    });
  });

  it("collects every problem, so the builder can list them all at once", () => {
    const raw = {
      stacks: [
        { ...V1.stacks[0], steps: [{ id: "s1", type: "copyBySelector" }] },
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

    expect(config.stacks.map((s) => s.id)).toEqual(["copy-id"]);
  });

  it("treats storage with nothing in it as an empty config, not an error", async () => {
    stubChromeStorage();

    await expect(loadConfig()).resolves.toMatchObject({ stacks: [], sites: [] });
  });

  it("throws on a stored config that cannot be parsed, so the resolver can report it", async () => {
    stubChromeStorage({ [CONFIG_KEY]: { stacks: [{ id: "a" }] } });

    await expect(loadConfig()).rejects.toThrow(/binding/);
  });

  it("reads storage once however many keystrokes follow", async () => {
    stubChromeStorage({ [CONFIG_KEY]: V1 });
    const get = vi.spyOn(chrome.storage.local, "get");

    await loadConfig();
    await loadConfig();
    await loadConfig();

    // The old resolver fetched stacks.json on every single keydown.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("serves a saved config without going back to storage", async () => {
    stubChromeStorage();
    await loadConfig(); // caches the empty config

    await saveConfig({ schemaVersion: SCHEMA_VERSION, stacks: [], sites: [] });

    await expect(loadConfig()).resolves.toMatchObject({ stacks: [] });
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

    expect(config.stacks.map((s) => s.id)).toEqual(["copy-id"]);
    expect(storage.data[CONFIG_KEY]).toMatchObject({ schemaVersion: SCHEMA_VERSION });
  });

  it("leaves an existing config alone, so an update cannot overwrite the user's stacks", async () => {
    const mine = { schemaVersion: 2, stacks: [], sites: [] };
    const storage = stubChromeStorage({ [CONFIG_KEY]: mine });
    stubBundle(V1);

    await seedIfEmpty();

    expect(storage.data[CONFIG_KEY]).toBe(mine);
  });

  it("stores nothing when the bundled seed is unreachable", async () => {
    const storage = stubChromeStorage();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Failed to fetch"); }));

    await expect(seedIfEmpty()).resolves.toMatchObject({ stacks: [] });
    expect(storage.data[CONFIG_KEY]).toBeUndefined();
  });

  it("stores nothing when the bundled seed is broken — that is a shipping bug, not the user's", async () => {
    const storage = stubChromeStorage();
    stubBundle({ stacks: [{ id: "a", binding: {} }] });

    await seedIfEmpty();

    expect(storage.data[CONFIG_KEY]).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { injectIntoOpenTabs, syncContentScripts } from "../src/background/contentScripts";
import { CONFIG_KEY, clearCache } from "../src/core/configStore";
import { SCHEMA_VERSION } from "../src/core/schema";

type Script = { id: string; matches: string[]; js: string[]; runAt: string };

let registered: Script[];
let granted: string[];
let sites: { id: string; name: string; patterns: string[] }[];
let executed: { tabId: number; files: string[] }[];

// A granted origin is not enough on its own: the script is registered only
// where a site in the config points, so these tests set both.
function site(host: string) {
  return { id: host, name: host, patterns: [host] };
}

beforeEach(() => {
  registered = [];
  granted = [];
  sites = [site("stage.dzo.com.ua")];
  executed = [];

  vi.stubGlobal("chrome", {
    permissions: {
      getAll: async () => ({ origins: granted })
    },
    storage: {
      local: {
        get: async () => ({ [CONFIG_KEY]: { schemaVersion: SCHEMA_VERSION, routines: [], sites } })
      }
    },
    scripting: {
      getRegisteredContentScripts: async ({ ids }: { ids: string[] }) =>
        registered.filter((s) => ids.includes(s.id)),
      registerContentScripts: async (scripts: Script[]) => {
        registered.push(...scripts);
      },
      updateContentScripts: async (scripts: Script[]) => {
        for (const script of scripts) {
          const i = registered.findIndex((s) => s.id === script.id);
          registered[i] = script;
        }
      },
      unregisterContentScripts: async ({ ids }: { ids: string[] }) => {
        registered = registered.filter((s) => !ids.includes(s.id));
      },
      executeScript: async ({ target, files }: { target: { tabId: number }; files: string[] }) => {
        executed.push({ tabId: target.tabId, files });
      }
    },
    tabs: {
      query: async () => [{ id: 7 }, { id: 8 }]
    }
  });

  clearCache(); // configStore memoizes, and a cache outlives a test
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncContentScripts", () => {
  it("registers nothing when no origin has been granted", async () => {
    await syncContentScripts();

    expect(registered).toEqual([]);
  });

  it("registers the content script against every granted origin a site points at", async () => {
    granted = ["*://stage.dzo.com.ua/*"];

    await syncContentScripts();

    expect(registered).toEqual([
      { id: "keyroutine-content", matches: ["*://stage.dzo.com.ua/*"], js: ["content.js"], runAt: "document_idle" }
    ]);
  });

  it("updates rather than re-registers once a script already exists", async () => {
    granted = ["*://stage.dzo.com.ua/*"];
    await syncContentScripts();

    granted = ["*://stage.dzo.com.ua/*", "*://other.test/*"];
    sites = [site("stage.dzo.com.ua"), site("other.test")];
    clearCache();
    await syncContentScripts();

    expect(registered).toHaveLength(1);
    expect(registered[0].matches).toEqual(["*://stage.dzo.com.ua/*", "*://other.test/*"]);
  });

  // The point of the split: a fetchUrl step's host is granted so the worker
  // can call it, and that must not put a key listener on its pages.
  it("leaves out an origin granted with no site pointing at it", async () => {
    granted = ["*://stage.dzo.com.ua/*", "*://api.dzo.com.ua/*"];

    await syncContentScripts();

    expect(registered[0].matches).toEqual(["*://stage.dzo.com.ua/*"]);
  });

  it("registers nothing when the only granted origin is a fetch target", async () => {
    granted = ["*://api.dzo.com.ua/*"];
    sites = [];
    clearCache();

    await syncContentScripts();

    expect(registered).toEqual([]);
  });

  it("keeps an Everywhere grant, which is an injection choice in itself", async () => {
    granted = ["<all_urls>"];
    sites = [];
    clearCache();

    await syncContentScripts();

    expect(registered[0].matches).toEqual(["<all_urls>"]);
  });

  it("unregisters once every grant is gone", async () => {
    granted = ["*://stage.dzo.com.ua/*"];
    await syncContentScripts();

    granted = [];
    await syncContentScripts();

    expect(registered).toEqual([]);
  });
});

describe("injectIntoOpenTabs", () => {
  it("executes the content script in each tab matching the new origin", async () => {
    await injectIntoOpenTabs(["*://stage.dzo.com.ua/*"]);

    expect(executed).toEqual([
      { tabId: 7, files: ["content.js"] },
      { tabId: 8, files: ["content.js"] }
    ]);
  });

  it("does nothing for an empty origin list", async () => {
    await injectIntoOpenTabs([]);

    expect(executed).toEqual([]);
  });
});

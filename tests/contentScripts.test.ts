import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { injectIntoOpenTabs, syncContentScripts } from "../src/background/contentScripts";

type Script = { id: string; matches: string[]; js: string[]; runAt: string };

let registered: Script[];
let granted: string[];
let executed: { tabId: number; files: string[] }[];

beforeEach(() => {
  registered = [];
  granted = [];
  executed = [];

  vi.stubGlobal("chrome", {
    permissions: {
      getAll: async () => ({ origins: granted })
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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncContentScripts", () => {
  it("registers nothing when no origin has been granted", async () => {
    await syncContentScripts();

    expect(registered).toEqual([]);
  });

  it("registers the content script against every granted origin", async () => {
    granted = ["*://stage.dzo.com.ua/*"];

    await syncContentScripts();

    expect(registered).toEqual([
      { id: "keystack-content", matches: ["*://stage.dzo.com.ua/*"], js: ["content.js"], runAt: "document_idle" }
    ]);
  });

  it("updates rather than re-registers once a script already exists", async () => {
    granted = ["*://stage.dzo.com.ua/*"];
    await syncContentScripts();

    granted = ["*://stage.dzo.com.ua/*", "*://other.test/*"];
    await syncContentScripts();

    expect(registered).toHaveLength(1);
    expect(registered[0].matches).toEqual(["*://stage.dzo.com.ua/*", "*://other.test/*"]);
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

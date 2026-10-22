import { vi } from "vitest";
import { clearCache } from "../src/core/configStore";

// The config seam moved from fetch to chrome.storage.local, so more than one
// suite needs a storage double. Enough of the API for configStore: a get that
// takes a key or a list of them (content/vars.ts asks for the current key and
// the pre-0.7 one in a single call), a set, and the onChanged listener it
// registers at import time (the real one invalidates the cache; here it is a
// no-op the stub only has to survive).
export type FakeStorage = {
  data: Record<string, unknown>;
  /** Fires the onChanged listeners, as a real write from another context would. */
  writeFromElsewhere(key: string, value: unknown): void;
};

export function stubChromeStorage(initial: Record<string, unknown> = {}): FakeStorage {
  const data: Record<string, unknown> = { ...initial };
  const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];

  vi.stubGlobal("chrome", {
    runtime: { getURL: (p: string) => `chrome-extension://x/${p}` },
    // Not under test here — pretend every origin is already granted so a
    // pane that asks (sitesPane's grant rows) gets a sensible default
    // instead of throwing on a missing API. See stubChromePermissions for
    // suites that actually exercise granting.
    permissions: {
      contains: async () => true,
      request: async () => true
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => {
          const out: Record<string, unknown> = {};
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            if (key in data) out[key] = data[key];
          }
          return out;
        },
        set: async (entries: Record<string, unknown>) => {
          Object.assign(data, entries);
        }
      },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
          listeners.push(fn);
        }
      }
    }
  });

  // configStore memoizes, and a module-level cache outlives a test.
  clearCache();

  return {
    data,
    writeFromElsewhere(key, value) {
      data[key] = value;
      for (const fn of listeners) fn({ [key]: { newValue: value } }, "local");
    }
  };
}

// Overrides the default stubChromeStorage permissions stub (which treats
// everything as already granted) with one that actually tracks requests, for
// suites exercising options/grant.ts and sitesPane's grant rows.
export type FakePermissions = {
  granted: string[];
  requested: string[][];
};

export function stubChromePermissions(initiallyGranted: string[] = []): FakePermissions {
  const granted = [...initiallyGranted];
  const requested: string[][] = [];
  // Usable standalone (grant.test.ts) or after stubChromeStorage/Tabs has
  // already put a chrome global in place — either way this only touches
  // the permissions key.
  if (globalThis.chrome === undefined) vi.stubGlobal("chrome", {});
  const chromeStub = globalThis.chrome as unknown as Record<string, unknown>;

  chromeStub.permissions = {
    contains: async ({ origins }: { origins: string[] }) => origins.every((o) => granted.includes(o)),
    request: async ({ origins }: { origins: string[] }) => {
      requested.push(origins);
      for (const o of origins) if (!granted.includes(o)) granted.push(o);
      return true;
    }
  };

  return { granted, requested };
}

// The builder also talks to the page it is building for: chrome.tabs.query to
// find it, sendMessage to ask it something (see core/builderProtocol.ts), and
// update to hand the user over and back for the element picker.
export type FakeTabs = {
  sent: { type?: string; [key: string]: unknown }[];
  activated: number[];
};

export function stubChromeTabs(
  respond: (message: { type?: string; [key: string]: unknown }) => unknown
): FakeTabs {
  const sent: FakeTabs["sent"] = [];
  const activated: number[] = [];
  const chromeStub = globalThis.chrome as unknown as Record<string, unknown>;

  chromeStub.tabs = {
    query: async () => [{ id: 7, url: "http://dzo.lh/tenders/1", lastAccessed: 2 }],
    getCurrent: async () => ({ id: 1, url: "chrome-extension://x/options.html" }),
    update: async (tabId: number) => {
      activated.push(tabId);
    },
    sendMessage: async (_tabId: number, message: { type?: string }) => {
      sent.push(message);
      return respond(message);
    }
  };

  return { sent, activated };
}

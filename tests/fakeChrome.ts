import { vi } from "vitest";
import { clearCache } from "../src/core/configStore";

// The config seam moved from fetch to chrome.storage.local, so more than one
// suite needs a storage double. Enough of the API for configStore: a get that
// takes a single key, a set, and the onChanged listener it registers at import
// time (the real one invalidates the cache; here it is a no-op the stub only
// has to survive).
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
    storage: {
      local: {
        get: async (key: string) => (key in data ? { [key]: data[key] } : {}),
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

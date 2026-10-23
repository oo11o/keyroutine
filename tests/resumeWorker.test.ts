import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SAVE_RESUME_MESSAGE_TYPE,
  TAKE_RESUME_MESSAGE_TYPE,
  type ResumeRecord
} from "../src/background/protocol";

// The worker registers its listener on import, so the test drives that
// listener directly. Storage is a plain object behind the chrome.storage
// .session API — enough to exercise the rules that matter here: one-shot
// reads, per-tab keying, and expiry.
type Listener = (msg: unknown, sender: chrome.runtime.MessageSender, respond: (r?: unknown) => void) => unknown;

let listener: Listener;
let store: Record<string, unknown>;

function record(over: Partial<ResumeRecord> = {}): ResumeRecord {
  return { routineId: "sync", nextStep: 2, vars: [], notes: [], expiresAt: Date.now() + 15_000, ...over };
}

function send(message: unknown, tabId: number | undefined): Promise<unknown> {
  return new Promise((resolve) => {
    const kept = listener(message, { tab: tabId === undefined ? undefined : { id: tabId } } as chrome.runtime.MessageSender, resolve);
    if (!kept) resolve(undefined); // listener declined it — no response coming
  });
}

const save = (rec: ResumeRecord, tabId = 1) => send({ type: SAVE_RESUME_MESSAGE_TYPE, record: rec }, tabId);
const take = (tabId = 1) => send({ type: TAKE_RESUME_MESSAGE_TYPE }, tabId) as Promise<{ record: ResumeRecord | null }>;

beforeEach(async () => {
  store = {};
  vi.stubGlobal("chrome", {
    // The worker also seeds the config on install and opens the builder from
    // the toolbar icon; both are registered on import, so the double has to
    // offer the hooks even though these tests drive neither.
    runtime: {
      onMessage: { addListener: (fn: Listener) => (listener = fn) },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      openOptionsPage: async () => {}
    },
    action: { onClicked: { addListener: () => {} } },
    permissions: {
      contains: async () => true,
      onAdded: { addListener: () => {} },
      onRemoved: { addListener: () => {} }
    },
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      // The worker re-syncs the content script when the config changes.
      onChanged: { addListener: () => {} },
      session: {
        get: async (k: string) => ({ [k]: store[k] }),
        set: async (entries: Record<string, unknown>) => Object.assign(store, entries),
        remove: async (k: string) => void delete store[k]
      }
    }
  });
  vi.resetModules();
  await import("../src/background/worker");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resume records in the worker", () => {
  it("hands a saved record back to the same tab", async () => {
    await save(record({ nextStep: 3 }));

    expect((await take()).record!.nextStep).toBe(3);
  });

  it("is one-shot — a second page load in that tab gets nothing", async () => {
    await save(record());

    expect((await take()).record).not.toBeNull();
    expect((await take()).record).toBeNull();
  });

  it("consumes the record even when it is expired, so it cannot linger", async () => {
    await save(record({ expiresAt: Date.now() - 1 }));

    expect((await take()).record).toBeNull();
    expect(store).toEqual({}); // removed, not just ignored
  });

  it("drops a record whose navigation never landed instead of firing it later", async () => {
    await save(record({ expiresAt: Date.now() - 60_000 }));

    expect((await take()).record).toBeNull();
  });

  it("does not let another tab claim this tab's routine", async () => {
    await save(record(), 1);

    expect((await take(2)).record).toBeNull();
    expect((await take(1)).record).not.toBeNull();
  });

  it("ignores a message that did not come from a tab", async () => {
    expect(await send({ type: TAKE_RESUME_MESSAGE_TYPE }, undefined)).toBeUndefined();
  });

  it("leaves messages it does not own to other listeners", async () => {
    expect(await send({ type: "something-else" }, 1)).toBeUndefined();
  });
});

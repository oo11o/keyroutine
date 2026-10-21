import {
  PICK_MESSAGE_TYPE,
  PROBE_MESSAGE_TYPE,
  type PickResponse,
  type ProbeResponse
} from "../core/builderProtocol";

// Everything the builder can only learn from a real page: how many elements a
// selector matches, and which element the user clicked. The options page has
// neither — it is an extension page — so both go through the content script in
// the tab the user was last on.
//
// State lives here rather than in the draft: a match count is not config, it is
// an observation about one page at one moment, and it must not make the config
// dirty or end up in an export.

type Listener = () => void;

export type TestResult = { count: number } | { error: string };

const tests = new Map<string, TestResult>();
let busy: string | null = null; // what we are waiting for, for the button labels
let trouble: string | null = null; // the last thing that went wrong reaching the tab
const listeners: Listener[] = [];

export function subscribe(listener: Listener): void {
  listeners.push(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

/* ── the tab we are talking to ─────────────────────────────────────────── */

// The page the user was last looking at, which is never the builder: the
// options page is an extension page, so filtering to http(s) is enough to
// exclude it along with chrome:// and the Web Store.
async function targetTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  const recent = [...tabs].sort(
    (a, b) => lastAccessed(b) - lastAccessed(a)
  )[0];
  if (!recent?.id) {
    throw new Error("Open the page you want this to work on in another tab, then try again.");
  }
  return recent;
}

function lastAccessed(tab: chrome.tabs.Tab): number {
  return (tab as { lastAccessed?: number }).lastAccessed ?? 0;
}

// chrome.tabs.sendMessage rejects when nothing is listening, which here means
// one specific thing: that tab was already open when the extension loaded, so
// it has no content script. Saying that is more useful than the raw message.
async function ask<T>(message: object): Promise<T> {
  const tab = await targetTab();
  try {
    const response = (await chrome.tabs.sendMessage(tab.id!, message)) as T | undefined;
    if (!response) throw new Error("no answer");
    return response;
  } catch {
    throw new Error(
      `Keystack is not running in that tab (${hostOf(tab.url)}). Reload the page and try again.`
    );
  }
}

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).host : "that tab";
  } catch {
    return "that tab";
  }
}

/* ── selector testing ──────────────────────────────────────────────────── */

// One key per field, so two selector fields in one action keep their own
// results: the action's id plus the field's name.
export function testKey(stackId: string, stepId: string, field: string): string {
  return `${stackId}:${stepId}:${field}`;
}

export function testResult(key: string): TestResult | undefined {
  return tests.get(key);
}

// A test result describes one spelling of one selector. The moment the field is
// edited it is about the previous spelling, so it goes.
export function forgetTest(key: string): void {
  tests.delete(key);
}

export async function testSelector(key: string, selector: string): Promise<void> {
  busy = `test:${key}`;
  trouble = null;
  announce();
  try {
    const response = await ask<ProbeResponse>({ type: PROBE_MESSAGE_TYPE, selector });
    tests.set(key, "count" in response ? { count: response.count } : { error: response.error });
  } catch (err) {
    tests.set(key, { error: (err as Error).message });
  } finally {
    busy = null;
    announce();
  }
}

/* ── picking ───────────────────────────────────────────────────────────── */

// Hands the user to the page, waits for their click, and brings them back. The
// two tab switches are the whole reason this is worth doing: without them the
// user has to find the tab, remember what they were picking, and come back by
// hand.
export async function pickSelector(key: string, apply: (selector: string) => void): Promise<void> {
  busy = `pick:${key}`;
  trouble = null;
  announce();
  const me = await chrome.tabs.getCurrent();
  try {
    const tab = await targetTab();
    await chrome.tabs.update(tab.id!, { active: true });
    const response = await ask<PickResponse>({ type: PICK_MESSAGE_TYPE });
    if ("error" in response) throw new Error(response.error);
    if (response.selector) {
      apply(response.selector);
      forgetTest(key);
    }
  } catch (err) {
    trouble = (err as Error).message;
  } finally {
    if (me?.id) await chrome.tabs.update(me.id, { active: true });
    busy = null;
    announce();
  }
}

// Everything observed so far is about the config that was open at the time, so
// an Import — which replaces all of it — invalidates the lot.
export function forgetAll(): void {
  tests.clear();
  trouble = null;
  announce();
}

export function isBusy(what?: string): boolean {
  return what === undefined ? busy !== null : busy === what;
}

export function lastTrouble(): string | null {
  return trouble;
}

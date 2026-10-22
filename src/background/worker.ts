// The service worker. Two jobs, both of which exist because a content
// script cannot do them:
//
//   1. fetch a cross-origin URL without the page's own CORS restrictions
//      applying, given host_permissions for that origin;
//   2. hold the resume records for stacks suspended by a navigation step —
//      a content script cannot outlive the page it runs in, so the state of
//      a half-finished stack has to be parked somewhere that does;
//   3. seed the stored config on install, and open the builder when the
//      toolbar icon is clicked.
import { seedIfEmpty } from "../core/configStore";
import { syncContentScripts, injectIntoOpenTabs } from "./contentScripts";
import {
  FETCH_MESSAGE_TYPE,
  SAVE_RESUME_MESSAGE_TYPE,
  TAKE_RESUME_MESSAGE_TYPE,
  type FetchRequest,
  type FetchResponse,
  type ResumeRecord,
  type ResumeResponse,
  type SaveResumeRequest
} from "./protocol";

type AnyRequest = FetchRequest | SaveResumeRequest | { type: string };

// chrome.storage.session, not a module-level Map: an idle MV3 worker is
// evicted after ~30s, which would take a pending resume with it. Session
// storage is in-memory (never written to disk) but survives worker restarts
// for the life of the browser session.
const key = (tabId: number) => `resume:${tabId}`;

// Keyed by tab, so a stack suspended in one tab cannot be picked up by a
// page loading in another.
async function saveResume(tabId: number, record: ResumeRecord): Promise<void> {
  await chrome.storage.session.set({ [key(tabId)]: record });
}

// Destructive read. The record is removed before the caller runs a single
// step of it: a stack that then fails must not leave its record behind to
// fire again on the next page that happens to load in this tab.
async function takeResume(tabId: number): Promise<ResumeRecord | null> {
  const k = key(tabId);
  const stored = (await chrome.storage.session.get(k)) as Record<string, ResumeRecord | undefined>;
  const record = stored[k];
  if (!record) return null;
  await chrome.storage.session.remove(k);
  // A navigation that never completed (network error, a download, a page
  // the user navigated away from) leaves a record nobody claims. Without
  // the expiry it would fire on whatever page loads in this tab next —
  // possibly hours later, on a site the stack knows nothing about.
  if (Date.now() > record.expiresAt) return null;
  return record;
}

chrome.runtime.onMessage.addListener((message: AnyRequest, sender, sendResponse) => {
  if (message?.type === FETCH_MESSAGE_TYPE) {
    (async (): Promise<FetchResponse> => {
      const url = (message as FetchRequest).url;
      try {
        // Without <all_urls>, fetch only reaches an origin the user has
        // actually granted (via the Sites tab) — everything else fails here
        // with an actionable message rather than a CORS error with none.
        const origin = `${new URL(url).origin}/*`;
        if (!(await chrome.permissions.contains({ origins: [origin] }))) {
          return { error: `Keystack needs access to ${new URL(url).origin} — add it as a site and grant access` };
        }
        const res = await fetch(url);
        const body = await res.text();
        return { ok: res.ok, status: res.status, body };
      } catch (err) {
        return { error: (err as Error).message };
      }
    })().then(sendResponse);
    return true; // keep the message channel open for the async sendResponse
  }

  // The content script does not know its own tab id; the worker does, from
  // the sender. That is the whole reason resume records live here rather
  // than in storage the content script could reach directly.
  const tabId = sender.tab?.id;

  if (message?.type === SAVE_RESUME_MESSAGE_TYPE) {
    if (tabId === undefined) return; // not from a tab — nothing to key on
    saveResume(tabId, (message as SaveResumeRequest).record).then(() => sendResponse({}));
    return true;
  }

  if (message?.type === TAKE_RESUME_MESSAGE_TYPE) {
    if (tabId === undefined) return;
    takeResume(tabId).then((record) => sendResponse({ record } satisfies ResumeResponse));
    return true;
  }

  return; // not ours — let another listener handle it
});

// The config lives in chrome.storage.local, so a fresh install starts with
// nothing to run. Copy the bundled config/stacks.json across once — onInstalled
// fires for an update too, and seedIfEmpty() is a no-op when storage already
// holds a config, so a user's own stacks are never overwritten by the seed.
chrome.runtime.onInstalled.addListener(() => {
  void seedIfEmpty();
  void syncContentScripts();
});

// registerContentScripts does not survive a browser restart on its own —
// re-derive it from whatever is still granted every time the browser starts.
chrome.runtime.onStartup.addListener(() => {
  void syncContentScripts();
});

// A grant made from the builder (see options/grant.ts) lands here: re-register
// the content script against the new set of origins, then reach into tabs
// already open on one of them so the user is not left to reload by hand.
chrome.permissions.onAdded.addListener((permissions) => {
  void syncContentScripts().then(() => injectIntoOpenTabs(permissions.origins ?? []));
});

chrome.permissions.onRemoved.addListener(() => {
  void syncContentScripts();
});

// No popup on the action: the builder needs a window's worth of room for three
// columns, so the icon opens the options page instead.
chrome.action?.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

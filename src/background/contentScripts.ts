// The content script used to be declared statically in the manifest,
// matching <all_urls>. It is now registered dynamically, matching only the
// origins the user has actually granted (see options/grant.ts) *and* pointed
// a site at — so a fresh install reaches no page at all until the user scopes
// a routine to one, and an origin granted only so a fetchUrl step can call it
// never gets the script (see injectableOrigins in core/match.ts).
import { loadConfig } from "../core/configStore";
import { injectableOrigins } from "../core/match";

const SCRIPT_ID = "keyroutine-content";

// Re-registers the script against whatever the config currently calls for.
// Called on install, on browser startup (registrations do not survive a
// restart on their own), whenever a grant is added or removed, and whenever
// the config changes — adding a site to an already-granted host has to start
// injection without a new permission prompt to hang it on.
export async function syncContentScripts(): Promise<void> {
  const granted = await chrome.permissions.getAll();
  // A config that fails to parse must not silently widen or narrow this: an
  // unreadable config means no sites to derive, so nothing is injected.
  const config = await loadConfig().catch(() => null);
  const origins = injectableOrigins(granted.origins ?? [], config?.sites ?? []);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });

  if (origins.length === 0) {
    if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }

  const script = {
    id: SCRIPT_ID,
    matches: origins,
    js: ["content.js"],
    runAt: "document_idle" as const
  };
  if (existing.length > 0) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}

// registerContentScripts only takes effect on a page's *next* load — a tab
// already sitting open on a newly-granted origin would otherwise need a
// manual reload before its hotkeys worked. This reaches those tabs directly.
export async function injectIntoOpenTabs(origins: string[]): Promise<void> {
  if (origins.length === 0) return;
  const tabs = await chrome.tabs.query({ url: origins });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {
      // The tab closed mid-loop, or is a page scripting cannot reach
      // (chrome://, the Web Store) — neither is this function's problem.
    }
  }
}

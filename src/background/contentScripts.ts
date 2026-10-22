// The content script used to be declared statically in the manifest,
// matching <all_urls>. It is now registered dynamically, matching only the
// origins the user has actually granted (see options/grant.ts) — so a fresh
// install reaches no page at all until the user scopes a stack to one.

const SCRIPT_ID = "keystack-content";

// Re-registers the script against whatever is currently granted. Called on
// install, on browser startup (registrations do not survive a restart on
// their own), and whenever a grant is added or removed.
export async function syncContentScripts(): Promise<void> {
  const granted = await chrome.permissions.getAll();
  const origins = granted.origins ?? [];
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

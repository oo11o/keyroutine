// The variables you define in the Variables tab, deliberately not in
// config/*.json. Nothing under config/ is web_accessible_resources any more
// (settings.json moved behind the worker — see background/protocol.ts — and
// routines.json never was), but a variable has no reason to go anywhere a
// future static resource might one day be exposed from. storage.local is
// reachable only by the extension, and content scripts can read it directly
// — no background worker, no message passing.
//
// This is not secrecy and does not pretend to be: an extension has no server,
// so the value sits in plaintext on the machine and anyone with devtools can
// read it. What it buys is that it is out of git and out of reach of web pages.
export const VARS_KEY = "vars";
const LEGACY_KEY = "secrets"; // what the same values were stored under until 0.7

export async function loadVars(): Promise<Record<string, string>> {
  const none: Record<string, string> = {};
  try {
    // chrome.storage.local.get is typed as returning a bare object, so the
    // shape we put in has to be asserted on the way out.
    const stored = (await chrome.storage.local.get([VARS_KEY, LEGACY_KEY])) as {
      vars?: Record<string, string>;
      secrets?: Record<string, string>;
    };
    // Read-side migration, so a routine keeps working on a profile that has not
    // opened the Variables tab since the rename. The tab writes the new key.
    return stored.vars ?? stored.secrets ?? none;
  } catch {
    return none; // storage unavailable (or no permission) — routines using $<name> fail loudly
  }
}

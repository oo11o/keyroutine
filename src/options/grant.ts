import { permissionOrigin } from "../core/match";

// chrome.permissions.request only works called directly from a user gesture
// in an extension page — the builder is the one place Keystack can ever ask
// for this, which is why every call site here is a click handler, not
// something run on load or from a hotkey.

export async function ensureOrigin(pattern: string): Promise<boolean> {
  const origin = permissionOrigin(pattern);
  if (origin === "") return false;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

export async function hasOrigin(pattern: string): Promise<boolean> {
  const origin = permissionOrigin(pattern);
  return origin === "" ? false : chrome.permissions.contains({ origins: [origin] });
}

// "Everywhere" has no host to derive a permission from — it means literally
// every site, which is its own grant rather than a per-pattern one.
export const EVERYWHERE_ORIGIN = "<all_urls>";

export async function ensureEverywhere(): Promise<boolean> {
  if (await chrome.permissions.contains({ origins: [EVERYWHERE_ORIGIN] })) return true;
  return chrome.permissions.request({ origins: [EVERYWHERE_ORIGIN] });
}

export async function hasEverywhere(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [EVERYWHERE_ORIGIN] });
}

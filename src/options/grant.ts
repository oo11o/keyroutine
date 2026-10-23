import { EVERYWHERE_ORIGIN, permissionOrigin } from "../core/match";

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

// The same two calls against an origin that was derived somewhere else (a
// fetchUrl step's host, via fetchOrigin) rather than from a site pattern.
export async function ensureHostOrigin(origin: string): Promise<boolean> {
  if (origin === "") return false;
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

export async function hasHostOrigin(origin: string): Promise<boolean> {
  return origin === "" ? false : chrome.permissions.contains({ origins: [origin] });
}

export async function hasOrigin(pattern: string): Promise<boolean> {
  const origin = permissionOrigin(pattern);
  return origin === "" ? false : chrome.permissions.contains({ origins: [origin] });
}

// Re-exported so call sites asking for the Everywhere grant do not have to
// know it comes from core/match — injectableOrigins() there needs the same
// constant to tell an Everywhere grant from a per-host one.
export { EVERYWHERE_ORIGIN };

export async function ensureEverywhere(): Promise<boolean> {
  if (await chrome.permissions.contains({ origins: [EVERYWHERE_ORIGIN] })) return true;
  return chrome.permissions.request({ origins: [EVERYWHERE_ORIGIN] });
}

export async function hasEverywhere(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [EVERYWHERE_ORIGIN] });
}

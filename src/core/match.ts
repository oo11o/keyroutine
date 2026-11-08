import type { Config, Site, Routine } from "./schema";

// URL patterns, deliberately a small subset of Chrome's match patterns: "*"
// is the only wildcard and everything else matches literally. We need our own
// matcher because no Chrome API tests an arbitrary pattern string against a
// URL — the manifest ones are consumed by the browser, never exposed to us.
//
// A pattern with no "://" is read as a bare host: "example.com" means
// "*://example.com/*". That shorthand exists because it is what people type into
// the builder's site box, and reading it literally would match nothing.
export function expandPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("://")) return trimmed;
  // Host only, unless the user typed a path too ("example.com/account").
  return trimmed.includes("/") ? `*://${trimmed}` : `*://${trimmed}/*`;
}

// Anchored at both ends, so "https://example.com/*" does not match
// "https://evil.test/?next=https://example.com/".
//
// A pattern with no "*" in it anywhere covers the page it names *and whatever
// is under it*: "example.com/reports" is how everyone writes "the reports
// section", and reading it as that one exact URL made it silently useless the
// moment you opened a report. Writing a "*" yourself turns the shorthand off
// and the pattern is matched literally, so "example.com/reports/*" still means
// strictly below /reports, and "example.com/search?q=*" still means exactly
// that query.
//
// The subtree is a path step, never a string prefix: /reports covers
// /reports/4821 and not /reports-archive.
export function patternToRegExp(pattern: string): RegExp {
  const literal = !pattern.includes("*");
  // A trailing slash would otherwise demand a second one from the subtree.
  const expanded = literal ? expandPattern(pattern).replace(/\/$/, "") : expandPattern(pattern);
  const escaped = expanded
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${literal ? "(/.*)?" : ""}$`, "i");
}

// What a pattern is actually tested against. A URL carries two parts nobody
// writes into a pattern by accident:
//
//   - the fragment, which never reaches the server and never identifies a
//     section of a site, so it is always dropped;
//   - the query, which does — but "example.com/reports" plainly means the
//     reports page, not "the reports page only while it is unfiltered". A
//     pattern that says nothing about the query matches any query; one that
//     mentions "?" is taken at its word and matched against the whole URL.
//
// Without this, adding the section you are standing on silently fails the
// moment you are on page 2 of it.
function urlForPattern(url: string, pattern: string): string {
  const withoutHash = url.split("#")[0];
  return expandPattern(pattern).includes("?") ? withoutHash : withoutHash.split("?")[0];
}

// For a bare host pattern typed without "://" or "*" (the builder's site-box
// shorthand), "www." is the one subdomain variance nobody means to exclude:
// typing "ukr.net" when the site actually lives at "www.ukr.net" (or vice
// versa) is a naming accident, not an intent to scope the pattern tighter.
// Anything fancier than that — real subdomains, explicit schemes, wildcards
// the user wrote themselves — stays exact, so this only ever toggles one
// specific "www." prefix on or off the host.
function wwwToggled(pattern: string): string | null {
  if (pattern.includes("://") || pattern.includes("*")) return null;
  const slash = pattern.indexOf("/");
  const host = slash === -1 ? pattern : pattern.slice(0, slash);
  const rest = slash === -1 ? "" : pattern.slice(slash);
  if (!host) return null;
  return host.toLowerCase().startsWith("www.") ? host.slice(4) + rest : `www.${host}${rest}`;
}

// A pattern that claims every host — "*", "*://*/*", or anything whose last
// host label is a wildcard ("example.*", which is every TLD). Refused, not
// supported: a "site" that is every site would be Common wearing a site's
// clothes, and that distinction carries weight now — Fetch URL is allowed in
// a site-scoped routine precisely because a site names where it may reach
// (see siteOnlySteps in core/stepMeta.ts). Everywhere is still available; it
// is called Common, and it cannot hold a fetch.
export function overBroadPattern(pattern: string): boolean {
  const host = patternHost(pattern);
  if (host === "") return false; // a blank pattern is an unfilled row, not this
  const last = host.split(":")[0].split(".").pop() ?? "";
  return host === "*" || last === "" || last.includes("*");
}

export function matchesPattern(url: string, pattern: string): boolean {
  // Belt and braces for a config that was written by hand: such a pattern is
  // refused by the builder and by Save, and matches nothing if it arrives
  // anyway, so no routine can fire through one.
  if (overBroadPattern(pattern)) return false;
  if (expandPattern(pattern) === "") return false;
  if (patternToRegExp(pattern).test(urlForPattern(url, pattern))) return true;
  const toggled = wwwToggled(pattern.trim());
  return toggled !== null && patternToRegExp(toggled).test(urlForPattern(url, toggled));
}

export function matchesUrl(url: string, patterns: string[]): boolean {
  // A blank pattern is an unfilled row in the builder, not a match-everything.
  return patterns.some((p) => matchesPattern(url, p));
}

// How narrowly a pattern aims. A pattern that constrains only the host applies
// to a whole domain; one that constrains the path applies to particular pages.
export type Level = "common" | "domain" | "url";

export function patternLevel(pattern: string): "domain" | "url" {
  const expanded = expandPattern(pattern);
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  const path = slash === -1 ? "" : afterScheme.slice(slash);
  return path === "" || path === "/" || path === "/*" ? "domain" : "url";
}

// The path a pattern narrows to, or "" when it claims the whole host. Used by
// the v2→v3 config migration (see core/migrateSites.ts) to read a legacy
// URL-level site's pattern into a routine's `pages`.
export function patternPath(pattern: string): string {
  const expanded = expandPattern(pattern);
  if (patternLevel(expanded) === "domain") return "";
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  return afterScheme.slice(afterScheme.indexOf("/"));
}

export function isCommon(routine: Routine): boolean {
  return routine.siteId === undefined || routine.siteId === null;
}

// The host(s) a site's permission/matching has to cover. One entry for a plain
// domain; two when subdomains are included, because Chrome's own
// "*://*.example.com/*" match pattern does not also cover the bare
// "example.com" — the two have always needed separate grants, same as typing
// both "example.com" and "*.example.com" as patterns did before this site held
// only one host.
export function siteOrigins(site: Site): string[] {
  return site.includeSubdomains ? [site.host, `*.${site.host}`] : [site.host];
}

export function siteMatchesUrl(site: Site, url: string): boolean {
  return siteOrigins(site).some((o) => matchesPattern(url, o));
}

// The one site whose host(s) claim this URL — sites are unique per host, so
// there is at most one answer, unlike the old multi-pattern sitesFor().
export function siteForUrl(url: string, sites: Site[]): Site | null {
  return sites.find((site) => siteMatchesUrl(site, url)) ?? null;
}

// Whether a routine's own pages claim this URL, given the site already matched
// it. Empty pages means every page of the site.
function routineMatchesUrl(routine: Routine, site: Site, url: string): boolean {
  if (routine.pages.length === 0) return true;
  return routine.pages.some((page) => siteOrigins(site).some((o) => matchesPattern(url, `${o}${page}`)));
}

// What applies here, in three tiers: these particular pages, then this whole
// domain, then everywhere. Built for the cheatsheet popup, which shows them
// under those headings, and reused for resolution — so the order a hotkey is
// chosen in and the order it is *explained* in come from one place and cannot
// drift.
//
// Narrowest tier first, because that is the order precedence works in: the
// routine that actually fires on this page is the first one listed, and the
// wider tiers below it are what is left over. An empty tier is left out, not
// shown empty.
export type RoutineSection = { level: Level; label: string; routines: Routine[] };

const LEVEL_LABEL: Record<"domain" | "url", string> = {
  domain: "This domain",
  url: "This page"
};

export function applicableSections(config: Config, url: string): RoutineSection[] {
  const enabled = config.routines.filter((r) => r.enabled);
  const sections: RoutineSection[] = [];

  const site = siteForUrl(url, config.sites);
  if (site) {
    const onSite = enabled.filter((r) => r.siteId === site.id);
    const pageScoped = onSite.filter((r) => r.pages.length > 0 && routineMatchesUrl(r, site, url));
    const allPages = onSite.filter((r) => r.pages.length === 0);
    if (pageScoped.length > 0) {
      sections.push({ level: "url", label: `${LEVEL_LABEL.url} · ${site.name}`, routines: pageScoped });
    }
    if (allPages.length > 0) {
      sections.push({ level: "domain", label: `${LEVEL_LABEL.domain} · ${site.name}`, routines: allPages });
    }
  }

  const common = enabled.filter(isCommon);
  if (common.length > 0) sections.push({ level: "common", label: "Everywhere", routines: common });

  return sections;
}

// Every enabled routine that could fire on this URL, narrowest scope first: a
// page-specific routine beats a whole-domain one, which beats a common one.
// That is already the order the sections are in, so this is the same list with
// the headings taken off — the resolver picks a chord with a plain `.find()`
// and never has to know that sites exist at all.
//
// A routine pointing at a siteId that no longer exists applies nowhere. It is
// deliberately not promoted to common: a deleted site must not hand its chords
// to every page on the web.
export function applicableRoutines(config: Config, url: string): Routine[] {
  return applicableSections(config, url).flatMap((section) => section.routines);
}

// The host a pattern aims at, lowercased and with the scheme and path dropped.
export function patternHost(pattern: string): string {
  const expanded = expandPattern(pattern);
  if (expanded === "") return "";
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  return (slash === -1 ? afterScheme : afterScheme.slice(0, slash)).toLowerCase();
}

// Chrome match patterns (what chrome.permissions.request() takes) have no
// syntax for a port — "*://localhost:8000/*" is rejected outright, not
// narrowed. Dropping it is still sound: the permission is host-wide already
// (every path, every scheme via "*://"), so "*://localhost/*" covers every
// port on that host, and KeyRoutine's own matching (patternToRegExp) is what
// actually narrows a routine to the port written in its pattern — this only
// ever decided whether the content script could be on the host at all.
function stripPort(host: string): string {
  return host.split(":")[0];
}

// The chrome.permissions origin a pattern needs granted before a routine
// scoped to it can run — host-only, even for a URL-level pattern. KeyRoutine's
// own matching (patternToRegExp) still decides which routines fire once the
// content script is there; this only decides whether it can be there at all.
export function permissionOrigin(pattern: string): string {
  const host = patternHost(pattern);
  return host === "" ? "" : `*://${stripPort(host)}/*`;
}

// The origin a fetchUrl step needs granted before the worker will call it
// (see background/worker.ts). Stricter than permissionOrigin(): a step URL is
// a template, so a host still holding a variable ("$base/items") names no
// origin to ask for, and neither does a non-http scheme. Returns "" in both
// cases, so the builder stays quiet rather than offering a grant on a host
// that may not be the one the step ends up calling.
export function fetchOrigin(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (parsed.host === "" || /[$\{]/.test(parsed.host)) return "";
  return `*://${stripPort(parsed.host.toLowerCase())}/*`;
}

// "Everywhere" has no host to derive a permission from — it means literally
// every site, which is its own grant rather than a per-pattern one.
export const EVERYWHERE_ORIGIN = "<all_urls>";

// Which of the granted origins KeyRoutine may actually run its content script
// on. Not simply "everything granted": a fetchUrl target is granted so the
// worker can *call* it (see background/worker.ts), and calling an API is no
// reason to inject a key listener into its pages and read their DOM. So the
// injection set is derived from the config — the sites the user created — and
// intersected with what Chrome has actually granted.
//
// This is the only place the two capabilities are separated. Chrome's own
// grant does not distinguish them: a granted origin authorises both, and it
// is this function declining to register the script that keeps a fetch-only
// host un-injected.
export function injectableOrigins(granted: string[], sites: Site[]): string[] {
  const wanted = new Set<string>();
  for (const site of sites) {
    for (const host of siteOrigins(site)) {
      const origin = permissionOrigin(host);
      if (origin !== "") wanted.add(origin);
    }
  }
  // Everywhere is an injection choice by definition — the user asked for
  // routines that fire on every site, so there is no narrower set to derive.
  return granted.filter((origin) => origin === EVERYWHERE_ORIGIN || wanted.has(origin));
}

// A concrete URL a pattern accepts, used only to ask whether two patterns can
// ever hit the same page. "*" is dropped rather than filled, and a wildcard
// scheme becomes https, so "example.com/reports/*" yields
// "https://example.com/reports/".
function sampleUrl(pattern: string): string {
  const expanded = expandPattern(pattern);
  if (expanded === "") return "";
  return expanded.replace("*://", "https://").split("*").join("");
}

// Do these two patterns overlap — is there a page both would claim? Testing
// every URL is not possible, so each pattern's sample is offered to the other:
// that catches the cases the UI needs ("example.com" vs "example.com/reports",
// a host vs a wildcard host) and errs towards "no" on exotic patterns, which
// costs a note in the builder rather than a wrong hotkey.
export function patternsOverlap(a: string, b: string): boolean {
  const sampleA = sampleUrl(a);
  const sampleB = sampleUrl(b);
  if (sampleA === "" || sampleB === "") return false;
  return matchesUrl(sampleA, [b]) || matchesUrl(sampleB, [a]);
}

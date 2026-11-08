import { expandPattern, patternHost, patternLevel, patternPath } from "./match";
import type { Routine, Site } from "./schema";
import { newId } from "./ids";

// v2's `Site.patterns` could be a bare domain or a domain+path, with a
// path-carrying site nested under its domain sibling only visually (see the
// old groupSites in core/match.ts, since removed). v3 splits that: a Site is
// just a host, and the path lives on the routine as `pages`. This module is
// the one-time, structural (not schemaVersion-branched) rewrite from the old
// shape to the new one — the same "detect the shape, not the version" style
// parseConfig already used for v1→v2.

type LegacySite = { id: string; name: string; patterns: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A raw site is legacy-shaped if it still carries the old `patterns` list
// instead of a `host`.
export function isLegacySite(raw: unknown): boolean {
  return isRecord(raw) && Array.isArray(raw.patterns) && typeof raw.host !== "string";
}

function toLegacySite(raw: Record<string, unknown>): LegacySite {
  const patterns = Array.isArray(raw.patterns)
    ? raw.patterns.filter((p): p is string => typeof p === "string" && p.trim() !== "")
    : [];
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : newId();
  const name = typeof raw.name === "string" && raw.name !== "" ? raw.name : id;
  return { id, name, patterns };
}

function legacyHost(site: LegacySite): string {
  for (const pattern of site.patterns) {
    const host = patternHost(pattern);
    if (host !== "") return host;
  }
  return "";
}

function isDomainLevel(site: LegacySite): boolean {
  return site.patterns.some((p) => expandPattern(p) !== "" && patternLevel(p) === "domain");
}

function pagesOf(site: LegacySite): string[] {
  return site.patterns.filter((p) => expandPattern(p) !== "" && patternLevel(p) === "url").map(patternPath);
}

function includesSubdomains(site: LegacySite): boolean {
  return site.patterns.some((p) => patternHost(p).startsWith("*."));
}

// Same grouping rule the old groupSites() used: first domain-level site per
// host wins the group, a url-level sibling nests under it as an "area", and a
// url-level site with no domain-level sibling gets its own group — every
// input site ends up in exactly one group, nothing dropped.
type Group = { site: LegacySite; areas: LegacySite[] };

function groupLegacySites(sites: LegacySite[]): Group[] {
  const parents = new Map<string, LegacySite>();
  for (const site of sites) {
    const host = legacyHost(site);
    if (host === "" || !isDomainLevel(site) || parents.has(host)) continue;
    parents.set(host, site);
  }
  const parentOf = (site: LegacySite): LegacySite | null => {
    const parent = parents.get(legacyHost(site));
    return parent && parent.id !== site.id && !isDomainLevel(site) ? parent : null;
  };
  const groups: Group[] = [];
  const byId = new Map<string, Group>();
  for (const site of sites) {
    if (parentOf(site)) continue;
    const group: Group = { site, areas: [] };
    groups.push(group);
    byId.set(site.id, group);
  }
  for (const site of sites) {
    const parent = parentOf(site);
    if (parent) byId.get(parent.id)?.areas.push(site);
  }
  return groups;
}

// Rewrites raw sites/routines from the v2 shape into v3 shape so
// parseSite/parseRoutine can read the result as if it had always been this
// way. A routine that pointed at an "area" site is redirected to that area's
// domain parent and gains that area's path as its `pages`; a routine that
// pointed straight at a domain site (even one whose own patterns also carried
// a path — double duty, allowed but never how the UI created an area) gets
// `pages: []`, since siteId alone already made it fire on the whole domain —
// the "url" classification only ever affected labelling and collision
// ranking, never whether it ran. An orphan area (no domain-level sibling at
// its host) becomes its own domain site, keyed by its own host, and its
// routines KEEP their derived pages rather than becoming "all pages" — it
// never matched the bare domain before, and widening it now would be a
// silent behaviour change, not a migration.
export function migrateLegacySites(
  rawSites: unknown[],
  rawRoutines: unknown[]
): { sites: unknown[]; routines: unknown[] } {
  const legacy = rawSites
    .map((s) => (isRecord(s) ? toLegacySite(s) : null))
    .filter((s): s is LegacySite => s !== null);
  const groups = groupLegacySites(legacy);

  const newSites: Record<string, unknown>[] = [];
  // Old site id (domain parent, orphan, or one of either's areas) → the new
  // domain-only site id plus the pages that old id now means.
  const redirect = new Map<string, { siteId: string; pages: string[] }>();

  for (const group of groups) {
    const host = legacyHost(group.site);
    const bareHost = host.startsWith("*.") ? host.slice(2) : host;
    newSites.push({
      id: group.site.id,
      name: group.site.name,
      host: bareHost,
      includeSubdomains: includesSubdomains(group.site)
    });
    redirect.set(group.site.id, {
      siteId: group.site.id,
      pages: isDomainLevel(group.site) ? [] : pagesOf(group.site)
    });
    for (const area of group.areas) {
      redirect.set(area.id, { siteId: group.site.id, pages: pagesOf(area) });
    }
  }

  const newRoutines = rawRoutines.map((r) => {
    if (!isRecord(r) || typeof r.siteId !== "string") return r;
    const to = redirect.get(r.siteId);
    if (!to) return r;
    return { ...r, siteId: to.siteId, pages: to.pages };
  });

  return { sites: newSites, routines: newRoutines };
}

// A site is unique per host by construction now — two Site rows for the same
// host is either an old config where each page was once its own standalone
// site with no domain sibling to nest under (migrateLegacySites above cannot
// always tell two such orphans apart as "the same domain"), or a hand-edited
// import. Either way, letting both stand would mean clicking "Grant access"
// on one silently granting the other too (same Chrome origin) while the
// Sites column shows them as if they needed separate grants — confusing
// without being wrong. Run unconditionally, after parsing, so it heals a
// config that already has the duplicate as readily as it prevents one from
// a fresh migration; a no-op when every host is already unique.
export function mergeDuplicateHostSites(
  sites: Site[],
  routines: Routine[]
): { sites: Site[]; routines: Routine[] } {
  const byHost = new Map<string, Site[]>();
  for (const site of sites) {
    if (site.host === "") continue;
    const list = byHost.get(site.host) ?? [];
    list.push(site);
    byHost.set(site.host, list);
  }

  const redirect = new Map<string, string>(); // dropped site id -> kept site id
  for (const list of byHost.values()) {
    if (list.length <= 1) continue;
    // Keeping subdomains on is the safer merge: dropping it would silently
    // narrow a grant/match that already worked for one of the duplicates.
    const anchor = list.find((s) => s.includeSubdomains) ?? list[0];
    for (const other of list) {
      if (other.id !== anchor.id) redirect.set(other.id, anchor.id);
    }
  }
  if (redirect.size === 0) return { sites, routines };

  return {
    sites: sites.filter((s) => !redirect.has(s.id)),
    routines: routines.map((r) =>
      r.siteId !== null && r.siteId !== undefined && redirect.has(r.siteId)
        ? { ...r, siteId: redirect.get(r.siteId)! }
        : r
    )
  };
}

import type { Config, Site, Stack } from "./schema";

// URL patterns, deliberately a small subset of Chrome's match patterns: "*"
// is the only wildcard and everything else matches literally. We need our own
// matcher because no Chrome API tests an arbitrary pattern string against a
// URL — the manifest ones are consumed by the browser, never exposed to us.
//
// A pattern with no "://" is read as a bare host: "dzo.lh" means
// "*://dzo.lh/*". That shorthand exists because it is what people type into
// the builder's site box, and reading it literally would match nothing.
export function expandPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("://")) return trimmed;
  // Host only, unless the user typed a path too ("dzo.lh/cabinet").
  return trimmed.includes("/") ? `*://${trimmed}` : `*://${trimmed}/*`;
}

// Anchored at both ends, so "https://dzo.lh/*" does not match
// "https://evil.test/?next=https://dzo.lh/".
export function patternToRegExp(pattern: string): RegExp {
  const escaped = expandPattern(pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function matchesUrl(url: string, patterns: string[]): boolean {
  // A blank pattern is an unfilled row in the builder, not a match-everything.
  return patterns.some((p) => expandPattern(p) !== "" && patternToRegExp(p).test(url));
}

// How narrowly a pattern aims. A pattern that constrains only the host applies
// to a whole domain; one that constrains the path applies to particular pages.
// Derived rather than declared: the distinction is already there in the pattern,
// and asking the user to also tick a box would let the two disagree.
export type Level = "common" | "domain" | "url";

export function patternLevel(pattern: string): "domain" | "url" {
  const expanded = expandPattern(pattern);
  const afterScheme = expanded.slice(expanded.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  const path = slash === -1 ? "" : afterScheme.slice(slash);
  return path === "" || path === "/" || path === "/*" ? "domain" : "url";
}

// The level at which a site claims this URL, or null if it does not. A site with
// both kinds of pattern counts as the narrower one it actually matched on:
// "dzo.lh" plus "dzo.lh/cabinet/*" is a URL-level site once you are in the
// cabinet, and a domain-level one everywhere else on the host.
export function siteLevel(url: string, site: Site): "domain" | "url" | null {
  const matched = site.patterns.filter(
    (p) => expandPattern(p) !== "" && patternToRegExp(p).test(url)
  );
  if (matched.length === 0) return null;
  return matched.some((p) => patternLevel(p) === "url") ? "url" : "domain";
}

// Every site that claims this URL, in config order. More than one legitimately
// can — a domain-wide site and a page-specific one are exactly the case the
// cheatsheet's three tiers exist for — so this is a list, not a first match.
export function sitesFor(url: string, sites: Site[]): { site: Site; level: "domain" | "url" }[] {
  const found: { site: Site; level: "domain" | "url" }[] = [];
  for (const site of sites) {
    const level = siteLevel(url, site);
    if (level) found.push({ site, level });
  }
  return found;
}

// The narrowest site claiming this URL — for the places where only one answer
// fits, like the column the builder opens on.
export function siteFor(url: string, sites: Site[]): Site | null {
  const matched = sitesFor(url, sites);
  return (matched.find((m) => m.level === "url") ?? matched[0])?.site ?? null;
}

export function isCommon(stack: Stack): boolean {
  return stack.siteId === undefined || stack.siteId === null;
}

// What applies here, in three tiers: everywhere, then this domain, then these
// particular URLs. Built for the cheatsheet popup, which shows them under those
// headings, and reused for resolution — so the order a hotkey is chosen in and
// the order it is *explained* in come from one place and cannot drift.
//
// Display order, widest tier first. An empty tier is left out, not shown empty.
export type StackSection = { level: Level; label: string; stacks: Stack[] };

const LEVEL_LABEL: Record<"domain" | "url", string> = {
  domain: "This domain",
  url: "This URL"
};

export function applicableSections(config: Config, url: string): StackSection[] {
  const enabled = config.stacks.filter((s) => s.enabled);
  const sections: StackSection[] = [];

  const common = enabled.filter(isCommon);
  if (common.length > 0) sections.push({ level: "common", label: "Everywhere", stacks: common });

  const matched = sitesFor(url, config.sites);
  for (const level of ["domain", "url"] as const) {
    for (const { site } of matched.filter((m) => m.level === level)) {
      const stacks = enabled.filter((s) => s.siteId === site.id);
      if (stacks.length === 0) continue;
      sections.push({ level, label: `${LEVEL_LABEL[level]} · ${site.name}`, stacks });
    }
  }
  return sections;
}

// Every enabled stack that could fire on this URL, narrowest scope first: a
// URL-specific stack beats a domain one, which beats a common one. The order is
// the point — the resolver picks a chord with a plain `.find()`, so it never has
// to know that sites exist at all.
//
// A stack pointing at a siteId that no longer exists applies nowhere. It is
// deliberately not promoted to common: a deleted site must not hand its chords
// to every page on the web.
export function applicableStacks(config: Config, url: string): Stack[] {
  const sections = applicableSections(config, url);
  // Not the display order reversed: within one tier, config order still decides.
  const tier = (level: Level) => sections.filter((s) => s.level === level).flatMap((s) => s.stacks);
  return [...tier("url"), ...tier("domain"), ...tier("common")];
}

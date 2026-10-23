import { columnHead, h, iconButton, row } from "./el";
import { icon } from "./icons";
import { groupSites, siteHost, siteScope, sitesFor } from "../core/match";
import type { Site } from "../core/schema";
import * as store from "./store";
import { COMMON } from "./store";
import { ensureEverywhere, ensureOrigin, hasEverywhere, hasOrigin } from "./grant";
import { grantStatusRow } from "./grantRow";

// Column 1 — where. Which pages a routine is allowed to fire on: everywhere
// ("Common"), or one of the sites below. The row for the page the builder was
// opened from says so, and that page is what a new site is pre-filled with,
// because "make this work here" is how a routine usually starts.
//
// A host and its sections are one group, not three unrelated rows:
// stage.example.com owns the list, and stage.example.com/reports sits under it
// as an area. The nesting is read out of the patterns (see groupSites) —
// nothing in the config declares it, so it cannot disagree with where routines
// fire.

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// The section of a site the URL is in: its first path segment, or "" at the
// root. One segment rather than the whole path, because "/reports" is the area
// a user means when they are looking at "/reports/4821/edit".
function areaOf(url: string): string {
  try {
    const segment = new URL(url).pathname.split("/").filter(Boolean)[0];
    return segment ? `/${segment}` : "";
  } catch {
    return "";
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// A small pill next to a row, flagging the rows that cannot fire yet — a
// granted site says nothing, since "works" is the expected state and the
// list is easier to read when only the exceptions are marked. Starts hidden
// rather than guessing, since the check is async and a wrong guess for even
// a moment is worse than nothing for one.
function grantBadge(check: () => Promise<boolean>): HTMLElement {
  const badge = h("span", { class: "errchip", hidden: true });
  void check().then((granted) => {
    if (granted) {
      badge.remove();
      return;
    }
    badge.hidden = false;
    badge.textContent = "Not granted";
  });
  return badge;
}

// A site's routines need every one of its patterns reachable, not just one —
// a routine scoped to the narrower of two patterns would otherwise look live
// while the pattern it actually depends on has no grant behind it.
async function hasAllOrigins(site: Site): Promise<boolean> {
  if (site.patterns.length === 0) return false;
  const granted = await Promise.all(site.patterns.map(hasOrigin));
  return granted.every(Boolean);
}

async function ensureAllOrigins(site: Site): Promise<boolean> {
  const granted = await Promise.all(site.patterns.map(ensureOrigin));
  return granted.every(Boolean);
}

export function renderSites(pane: HTMLElement): void {
  const config = store.getConfig();
  const scope = store.getScope();
  const pageUrl = store.getPageUrl();
  pane.className = "c-site";

  // Every site that claims the page the builder was opened from, not just one:
  // a domain-wide site and a page-specific one can both apply.
  const matched = pageUrl ? sitesFor(pageUrl, config.sites) : [];
  const here = new Set(matched.map((m) => m.site.id));

  pane.append(
    columnHead({
      id: "h-sites",
      tone: "site",
      glyph: "globe",
      eyebrow: "1 · Where",
      title: "Sites",
      count: config.sites.length + 1,
      sub: ["Where your routines work"]
    })
  );

  pane.append(
    row(
      {
        class: store.sameScope(scope, COMMON) ? "is-sel" : "",
        "aria-pressed": store.sameScope(scope, COMMON) ? "true" : "false",
        onClick: () => store.selectScope(COMMON)
      },
      h("span", { class: "avatar avatar-globe" }, icon("globe")),
      h(
        "span",
        { class: "rowbody" },
        h("span", { class: "rowtitle", text: "Common" }),
        h("span", {
          class: "rowsub",
          text: `Every site · ${plural(store.routineCount(COMMON), "routine")}`
        })
      ),
      grantBadge(hasEverywhere)
    )
  );

  const groups = groupSites(config.sites);
  if (groups.length > 0) pane.append(h("div", { class: "sectionlabel", text: "Your sites" }));

  for (const group of groups) {
    pane.append(siteRow(group.site, here, false));
    if (group.areas.length === 0) continue;
    pane.append(
      h("div", { class: "arealist" }, ...group.areas.map((area) => siteRow(area, here, true)))
    );
  }

  pane.append(
    addButton(pageUrl, {
      domain: matched.some((m) => m.level === "domain"),
      url: matched.some((m) => m.level === "url")
    })
  );
  pane.append(scope.kind === "site" ? siteSettings(scope.siteId) : commonCard());
}

function siteRow(site: Site, here: Set<string>, isArea: boolean): HTMLElement {
  const scopeOf = { kind: "site" as const, siteId: site.id };
  const selected = store.sameScope(store.getScope(), scopeOf);
  return row(
    {
      class: `${isArea ? "is-area" : ""} ${selected ? "is-sel" : ""}`.trim(),
      "aria-pressed": selected ? "true" : "false",
      title: site.patterns.join("\n"),
      onClick: () => store.selectScope(scopeOf)
    },
    // An area belongs to the host above it, so it gets a tick rather than a
    // second initial competing with its parent's.
    isArea
      ? h("span", { class: "areamark", "aria-hidden": "true", text: "└" })
      : h("span", { class: "avatar", text: (site.name[0] ?? "?").toUpperCase() }),
    h(
      "span",
      { class: "rowbody" },
      h("span", { class: "rowtitle", text: site.name }),
      h("span", {
        class: "rowsub",
        // "this page" is the one thing a site row can say that the config
        // cannot: whether it claims the tab the user came from.
        text: plural(store.routineCount(scopeOf), "routine") + (here.has(site.id) ? " · this page" : "")
      })
    ),
    site.patterns.length > 0 ? grantBadge(() => hasAllOrigins(site)) : null
  );
}

// One button, three jobs, decided by what the page the builder was opened from
// already belongs to: a host with no site yet wants a site, a host that has one
// wants this section of it, and a page that is already covered down to the URL
// wants nothing in particular.
function addButton(pageUrl: string | null, claimed: { domain: boolean; url: boolean }): HTMLElement {
  const sites = store.getConfig().sites;
  const host = pageUrl ? hostOf(pageUrl) : "";
  // Named by this exact host, or claimed by a wildcard one ("*.example.com"):
  // either way the host has an owner and a second row for it would be a rival,
  // not a parent.
  const hasHost =
    claimed.domain || (host !== "" && sites.some((s) => siteHost(s) === host.toLowerCase()));
  const area = pageUrl ? areaOf(pageUrl) : "";

  let label = "Add site";
  let add = () => void store.addSite("New site", []);

  if (host !== "" && !hasHost) {
    label = `Add ${host}`;
    add = () => {
      store.addSite(host, [host]);
      void ensureOrigin(host);
    };
  } else if (host !== "" && area !== "" && !claimed.url) {
    label = `Add ${host}${area}`;
    // One pattern, no wildcard: a path on its own already means this page and
    // everything under it (see patternToRegExp).
    add = () => {
      store.addSite(area, [`${host}${area}`]);
      void ensureOrigin(`${host}${area}`);
    };
  }

  return h(
    "button",
    { type: "button", class: "btn btn-dashed", onClick: () => add() },
    icon("plus"),
    label
  );
}

function siteWording(label: string): { granted: string; missing: string } {
  return {
    granted: `Access granted — ${label} will fire.`,
    missing: `Not granted yet — ${label} will not fire.`
  };
}

function commonCard(): HTMLElement {
  return h(
    "div",
    { class: "card infocard" },
    h("p", {
      text:
        "Routines in Common work on every site. Put things you need everywhere here — " +
        "for example, pasting a test password."
    }),
    grantStatusRow(siteWording("Common routines"), hasEverywhere, ensureEverywhere).element
  );
}

function siteSettings(siteId: string): HTMLElement {
  const config = store.getConfig();
  const site = config.sites.find((s) => s.id === siteId);
  if (!site) return h("div");

  // Stable ids: an edit here redraws the column, and main.ts puts the caret
  // back by id.
  const name = h("input", { id: "site-name", class: "input", type: "text", value: site.name });
  name.addEventListener("input", () => store.patchSite(site.id, { name: name.value }));

  const chips = h("div", { class: "chiprow" });
  for (const pattern of site.patterns) {
    chips.append(
      h(
        "span",
        { class: "chip mono", text: pattern },
        iconButton("close", `Remove ${pattern}`, () =>
          store.patchSite(site.id, { patterns: site.patterns.filter((p) => p !== pattern) })
        )
      )
    );
  }

  // Added on Enter rather than per keystroke: a pattern is only a pattern once
  // it is finished, and half of one would match nothing while it was typed.
  const host = siteHost(site);
  const add = h("input", {
    id: "site-add-pattern",
    class: "input mono",
    type: "text",
    placeholder: host ? `Add a pattern, e.g. ${host}/contracts` : "Add a pattern, e.g. *.example.com",
    "aria-label": "Add URL pattern"
  });
  const group = groupSites(config.sites).find(
    (g) => g.site.id === site.id || g.areas.some((a) => a.id === site.id)
  );
  const parent = group && group.site.id !== site.id ? group.site : null;
  const areas = group && group.site.id === site.id ? group.areas : [];
  const count = store.routineCount({ kind: "site", siteId: site.id });

  const grant = grantStatusRow(
    siteWording(parent ? "this area" : "this site"),
    () => hasAllOrigins(site),
    () => ensureAllOrigins(site)
  );

  add.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Enter") return;
    const pattern = add.value.trim();
    if (pattern === "") return;
    add.value = "";
    store.patchSite(site.id, { patterns: [...site.patterns, pattern] });
    void ensureOrigin(pattern).then(grant.refresh);
  });

  return h(
    "div",
    { class: "card settings" },
    h("div", { class: "settings-head", text: parent ? "Area settings" : "Site settings" }),
    // Where this row sits in the list, and why: both facts are consequences of
    // the patterns, so saying them here is the only place the user can learn
    // the rule without guessing.
    parent
      ? h("div", {
          class: "hint",
          text: `An area of ${parent.name} — its routines win here, over the ones on ${parent.name} itself.`
        })
      : null,
    h("label", { class: "field" }, h("span", { class: "label", text: "Name" }), name),
    h(
      "div",
      { class: "field" },
      h("span", { class: "label", text: "Matches these URLs" }),
      site.patterns.length > 0 ? chips : null,
      add,
      // The three shapes a pattern can take, said as plainly as the add
      // field's own placeholder: what you'd type, and what it means.
      h(
        "ul",
        { class: "patternlegend hint" },
        h("li", {}, h("code", { text: "example.com" }), " — every page on this domain."),
        h("li", {}, h("code", { text: "example.com/tenders" }), " — this page, and everything under it."),
        h("li", {}, h("code", { text: "*" }), " — every website.")
      ),
      siteScope(site) === "domain" && host !== ""
        ? h("span", {
            class: "hint",
            text: `A pattern with a path (${host}/contracts) becomes its own area here, with its own routines.`
          })
        : null,
      // A site with no patterns matches nothing, so every routine on it is dead.
      // Said here rather than only at save time, where it would arrive long
      // after the mistake.
      site.patterns.length === 0
        ? h("span", { class: "errtext", text: "Without a pattern this site matches nothing." })
        : null
    ),
    site.patterns.length > 0 ? grant.element : null,
    h(
      "div",
      {},
      h("button", {
        type: "button",
        class: "btn btn-danger btn-sm",
        style: "margin-left:-10px",
        text: parent ? "Delete area…" : "Delete site…",
        onClick: () => confirmDelete(site.id, site.name, count, areas)
      })
    )
  );
}

// The routines are the question, not the site: deleting them and promoting them
// to "runs everywhere" each lose something the other keeps, so both are asked
// for explicitly and neither is the default.
//
// The areas are not part of the question. They are sites in their own right
// with their own routines, so deleting the host leaves them standing — said out
// loud, because the indentation suggests otherwise.
function confirmDelete(siteId: string, name: string, routines: number, areas: Site[]): void {
  const orphans =
    areas.length > 0
      ? `\n\nIts ${plural(areas.length, "area")} (${areas.map((a) => a.name).join(", ")}) ` +
        `keep working and move up to the top of the list.`
      : "";
  if (routines === 0) {
    if (confirm(`Delete the site "${name}"?${orphans}`)) store.deleteSite(siteId, false);
    return;
  }
  const keep = confirm(
    `"${name}" has ${routines} routine${routines === 1 ? "" : "s"}.${orphans}\n\n` +
      `OK — keep them as common routines, running everywhere.\n` +
      `Cancel — choose to delete them instead.`
  );
  if (keep) {
    store.deleteSite(siteId, true);
    return;
  }
  if (confirm(`Delete "${name}" and its ${routines} routine${routines === 1 ? "" : "s"} for good?`)) {
    store.deleteSite(siteId, false);
  }
}

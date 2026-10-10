import { h, row } from "./el";
import { matchesUrl, patternLevel, sitesFor } from "../core/match";
import * as store from "./store";
import { COMMON } from "./store";

// Group 1. Which pages a stack is allowed to fire on — "everywhere", or one of
// the sites below. The row for the page the builder was opened from is marked,
// and offered as a site if it is not one yet, because "make this work here" is
// how a stack usually starts.

// "domain" when every pattern is host-wide, "URL" when every one names a path,
// "mixed" when it is some of each.
function tierLabel(patterns: string[]): string {
  const levels = new Set(patterns.map(patternLevel));
  if (levels.size === 0) return "";
  if (levels.size > 1) return "mixed";
  return levels.has("url") ? "URL" : "domain";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function renderSites(pane: HTMLElement): void {
  const config = store.getConfig();
  const scope = store.getScope();
  const pageUrl = store.getPageUrl();
  // Every site that claims the page the builder was opened from, not just one:
  // a domain-wide site and a page-specific one can both apply, and both rows
  // should say so.
  const here = new Map(
    (pageUrl ? sitesFor(pageUrl, config.sites) : []).map((m) => [m.site.id, m.level])
  );

  pane.append(h("h2", { class: "group-head" }, "Sites"));

  const rows = h("div", { class: "rows" });

  rows.append(
    row(
      {
        class: store.sameScope(scope, COMMON) ? "selected" : "",
        onClick: () => store.selectScope(COMMON)
      },
      h("span", { class: "mark", text: "★" }),
      h("span", { class: "grow", text: "Common (all sites)" }),
      h("span", { class: "count", text: String(store.stackCount(COMMON)) })
    )
  );

  for (const site of config.sites) {
    const scopeOf = { kind: "site" as const, siteId: site.id };
    const level = here.get(site.id);
    rows.append(
      row(
        {
          class: store.sameScope(scope, scopeOf) ? "selected" : "",
          title: [...site.patterns, level ? `matches the page you came from` : ""]
            .filter(Boolean)
            .join("\n"),
          onClick: () => store.selectScope(scopeOf)
        },
        h("span", {
          class: "mark",
          text: level ? "◉" : "",
          title: level ? "matches the page you came from" : ""
        }),
        h("span", { class: "grow", text: site.name }),
        // Which tier of the hotkey popup this site's stacks land in — domain-wide
        // or only on particular URLs. Derived from the patterns, so it cannot
        // disagree with what the runtime does.
        h("span", { class: "tier", text: tierLabel(site.patterns) }),
        h("span", { class: "count", text: String(store.stackCount(scopeOf)) })
      )
    );
  }

  pane.append(rows);

  // The page the builder was opened from belongs to no site yet — offer it,
  // pre-filled, instead of making the user retype the host.
  if (pageUrl && here.size === 0) {
    const host = hostOf(pageUrl);
    pane.append(
      h("div", { class: "add" }, h("button", {
        type: "button",
        class: "linky",
        text: `+ Add a site for ${host}`,
        onClick: () => openForm(pane, host, host)
      }))
    );
  }

  pane.append(
    h("div", { class: "add" }, h("button", {
      type: "button",
      text: "+ Add site…",
      onClick: () => openForm(pane, "", "")
    }))
  );

  if (scope.kind === "site") pane.append(siteEditor(scope.siteId));
}

// Name plus one pattern per line. The live "matches / does not match" line is
// the whole value of doing this in a UI: a pattern is easy to get subtly wrong
// and impossible to test by staring at it.
function openForm(pane: HTMLElement, name: string, pattern: string): void {
  const nameInput = h("input", { type: "text", value: name, placeholder: "test.dzo.com.ua" });
  const patterns = h("textarea", {
    class: "mono",
    value: pattern,
    placeholder: "dzo.lh\nhttps://test.dzo.com.ua/*",
    rows: 4
  });
  const verdict = h("div", { class: "help" });

  const recheck = (): void => {
    const url = store.getPageUrl();
    if (!url) {
      verdict.textContent = "";
      return;
    }
    const list = store.cleanPatterns(patterns.value.split("\n"));
    verdict.textContent =
      list.length === 0
        ? ""
        : matchesUrl(url, list)
          ? `✓ matches ${url}`
          : `✕ does not match ${url}`;
  };
  patterns.addEventListener("input", recheck);

  const form = h(
    "div",
    { class: "editor" },
    h("h3", { text: "New site" }),
    h("div", { class: "field" }, h("label", { text: "Name" }), nameInput),
    h(
      "div",
      { class: "field" },
      h("label", { text: "URL patterns" }),
      patterns,
      h("div", {
        class: "help",
        text:
          "One per line. * is the wildcard; a bare host means any scheme and any path. " +
          "A pattern with a path (dzo.lh/tenders/new) scopes to those URLs and takes " +
          "precedence over a domain-wide one."
      }),
      verdict
    ),
    h(
      "div",
      { class: "editor-actions" },
      h("button", {
        type: "button",
        class: "primary",
        text: "Add site",
        onClick: () => {
          const list = store.cleanPatterns(patterns.value.split("\n"));
          if (list.length === 0) {
            verdict.textContent = "✕ a site needs at least one pattern";
            return;
          }
          store.addSite(nameInput.value || list[0], list);
        }
      }),
      h("button", { type: "button", text: "Cancel", onClick: () => form.remove() })
    )
  );
  pane.append(form);
  recheck();
  nameInput.focus();
}

function siteEditor(siteId: string): HTMLElement {
  const site = store.getConfig().sites.find((s) => s.id === siteId);
  if (!site) return h("div");

  // Stable ids: an edit here redraws the column, and main.ts puts the caret
  // back by id.
  const patterns = h("textarea", {
    id: "site-patterns",
    class: "mono",
    value: site.patterns.join("\n"),
    rows: 4
  });
  patterns.addEventListener("input", () =>
    store.patchSite(site.id, { patterns: patterns.value.split("\n") })
  );

  const name = h("input", { id: "site-name", type: "text", value: site.name });
  name.addEventListener("input", () => store.patchSite(site.id, { name: name.value }));

  const count = store.stackCount({ kind: "site", siteId: site.id });

  return h(
    "div",
    { class: "editor" },
    h("h3", { text: "Site" }),
    h("div", { class: "field" }, h("label", { for: "site-name", text: "Name" }), name),
    h(
      "div",
      { class: "field" },
      h("label", { for: "site-patterns", text: "URL patterns" }),
      patterns,
      h("div", { class: "help", text: "One per line. * is the wildcard; a bare host means any scheme and any path." })
    ),
    h(
      "div",
      { class: "editor-actions" },
      h("button", {
        type: "button",
        text: "Delete site…",
        onClick: () => confirmDelete(site.id, site.name, count)
      })
    )
  );
}

// The stacks are the question, not the site: deleting them and promoting them
// to "runs everywhere" each lose something the other keeps, so both are asked
// for explicitly and neither is the default.
function confirmDelete(siteId: string, name: string, stacks: number): void {
  if (stacks === 0) {
    if (confirm(`Delete the site "${name}"?`)) store.deleteSite(siteId, false);
    return;
  }
  const keep = confirm(
    `"${name}" has ${stacks} stack${stacks === 1 ? "" : "s"}.\n\n` +
      `OK — keep them as common stacks, running everywhere.\n` +
      `Cancel — choose to delete them instead.`
  );
  if (keep) {
    store.deleteSite(siteId, true);
    return;
  }
  if (confirm(`Delete "${name}" and its ${stacks} stack${stacks === 1 ? "" : "s"} for good?`)) {
    store.deleteSite(siteId, false);
  }
}

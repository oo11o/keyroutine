import { columnHead, h, iconButton, row } from "./el";
import { icon } from "./icons";
import { sitesFor } from "../core/match";
import * as store from "./store";
import { COMMON } from "./store";

// Column 1 — where. Which pages a stack is allowed to fire on: everywhere
// ("Common"), or one of the sites below. The row for the page the builder was
// opened from says so, and that page is what a new site is pre-filled with,
// because "make this work here" is how a stack usually starts.

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function renderSites(pane: HTMLElement): void {
  const config = store.getConfig();
  const scope = store.getScope();
  const pageUrl = store.getPageUrl();
  pane.className = "c-site";

  // Every site that claims the page the builder was opened from, not just one:
  // a domain-wide site and a page-specific one can both apply.
  const here = new Set((pageUrl ? sitesFor(pageUrl, config.sites) : []).map((m) => m.site.id));

  pane.append(
    columnHead({
      id: "h-sites",
      tone: "site",
      glyph: "globe",
      eyebrow: "1 · Where",
      title: "Sites",
      count: config.sites.length + 1,
      sub: ["Where your stacks work"]
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
          text: `Every site · ${plural(store.stackCount(COMMON), "stack")}`
        })
      )
    )
  );

  if (config.sites.length > 0) pane.append(h("div", { class: "sectionlabel", text: "Your sites" }));

  for (const site of config.sites) {
    const scopeOf = { kind: "site" as const, siteId: site.id };
    const selected = store.sameScope(scope, scopeOf);
    pane.append(
      row(
        {
          class: selected ? "is-sel" : "",
          "aria-pressed": selected ? "true" : "false",
          title: site.patterns.join("\n"),
          onClick: () => store.selectScope(scopeOf)
        },
        h("span", { class: "avatar", text: (site.name[0] ?? "?").toUpperCase() }),
        h(
          "span",
          { class: "rowbody" },
          h("span", { class: "rowtitle", text: site.name }),
          h("span", {
            class: "rowsub",
            // "this page" is the one thing a site row can say that the config
            // cannot: whether it claims the tab the user came from.
            text:
              plural(store.stackCount(scopeOf), "stack") + (here.has(site.id) ? " · this page" : "")
          })
        )
      )
    );
  }

  // Pre-filled with the host when the page the builder was opened from belongs
  // to no site yet — that is the site the user is about to type by hand.
  const unclaimed = pageUrl && here.size === 0 ? hostOf(pageUrl) : null;
  pane.append(
    h(
      "button",
      {
        type: "button",
        class: "btn btn-dashed",
        onClick: () => store.addSite(unclaimed ?? "New site", unclaimed ? [unclaimed] : [])
      },
      icon("plus"),
      unclaimed ? `Add ${unclaimed}` : "Add site"
    )
  );

  pane.append(scope.kind === "site" ? siteSettings(scope.siteId) : commonCard());
}

function commonCard(): HTMLElement {
  return h("div", {
    class: "card infocard",
    text:
      "Stacks in Common work on every site. Put things you need everywhere here — " +
      "for example, pasting a test password."
  });
}

function siteSettings(siteId: string): HTMLElement {
  const site = store.getConfig().sites.find((s) => s.id === siteId);
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
  const add = h("input", {
    id: "site-add-pattern",
    class: "input mono",
    type: "text",
    placeholder: "Add a pattern, e.g. *.dzo.com.ua",
    "aria-label": "Add URL pattern"
  });
  add.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key !== "Enter") return;
    const pattern = add.value.trim();
    if (pattern === "") return;
    add.value = "";
    store.patchSite(site.id, { patterns: [...site.patterns, pattern] });
  });

  const count = store.stackCount({ kind: "site", siteId: site.id });

  return h(
    "div",
    { class: "card settings" },
    h("div", { class: "settings-head", text: "Site settings" }),
    h("label", { class: "field" }, h("span", { class: "label", text: "Name" }), name),
    h(
      "div",
      { class: "field" },
      h("span", { class: "label", text: "Matches these URLs" }),
      site.patterns.length > 0 ? chips : null,
      add,
      h("span", {
        class: "hint",
        text: "* matches anything. A bare host (example.com) matches any scheme and path."
      }),
      // A site with no patterns matches nothing, so every stack on it is dead.
      // Said here rather than only at save time, where it would arrive long
      // after the mistake.
      site.patterns.length === 0
        ? h("span", { class: "errtext", text: "Without a pattern this site matches nothing." })
        : null
    ),
    h(
      "div",
      {},
      h("button", {
        type: "button",
        class: "btn btn-danger btn-sm",
        style: "margin-left:-10px",
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

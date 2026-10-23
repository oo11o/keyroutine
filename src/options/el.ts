import { icon, type IconName } from "./icons";

// The smallest thing that keeps the panes from being createElement soup. Not a
// framework and not a step towards one: the builder re-renders whole columns
// from a config that is a few kilobytes, so there is nothing here to diff.

type Child = Node | string | null | undefined | false;

// "on*" keys become listeners, "class"/"text" are spelled the way HTML spells
// them, everything else is a property when the element has one (value, checked,
// disabled — which as attributes behave differently) and an attribute otherwise.
type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key === "text") el.textContent = String(value);
    else if (key.startsWith("on")) {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in el) {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  el.append(...(children.filter(Boolean) as (Node | string)[]));
  return el;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

// A row in one of the three columns. Always a <button>: the columns are
// navigated by clicking, so they should be reachable by Tab and Enter too.
export function row(attrs: Attrs = {}, ...children: Child[]): HTMLButtonElement {
  const { class: cls, ...rest } = attrs;
  return h("button", { type: "button", class: `row ${cls ?? ""}`.trim(), ...rest }, ...children);
}

// A labelled <button> with nothing in it but a glyph. The label is not optional:
// an icon-only control is unusable by a screen reader without one.
export function iconButton(
  name: IconName,
  label: string,
  onClick: () => void,
  extra: Attrs = {}
): HTMLButtonElement {
  return h(
    "button",
    {
      type: "button",
      class: "iconbtn",
      title: label,
      "aria-label": label,
      ...extra,
      onClick: (e: Event) => {
        // The header underneath is a button too, and a click on its tools must
        // not also toggle it.
        e.stopPropagation();
        onClick();
      }
    },
    icon(name)
  );
}

// The column headers: an icon tile, a numbered eyebrow, a title with a count,
// and a subtitle. The same three-part shape in all three columns, which is what
// makes "where / when / what" readable as one sentence across the page.
export function columnHead(opts: {
  id: string;
  tone: "site" | "routine" | "act";
  glyph: IconName;
  eyebrow: string;
  title: string;
  count: number;
  sub: Child[];
}): HTMLElement {
  return h(
    "div",
    { class: "colhead" },
    h("span", { class: "colicon" }, icon(opts.glyph)),
    h("span", { class: "eyebrow", text: opts.eyebrow }),
    h(
      "div",
      { class: "colhead-main" },
      h(
        "h2",
        { id: opts.id, class: "coltitle" },
        opts.title,
        h("span", { class: "colcount", text: String(opts.count) })
      ),
      h("p", { class: "colsub" }, ...opts.sub)
    )
  );
}

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

export function iconButton(glyph: string, title: string, onClick: () => void): HTMLButtonElement {
  return h("button", {
    type: "button",
    class: "icon",
    title,
    "aria-label": title,
    text: glyph,
    onClick: (e: Event) => {
      // The row underneath is a button too, and a click on its tools must not
      // also select it.
      e.stopPropagation();
      onClick();
    }
  });
}

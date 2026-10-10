import { h } from "./el";
import type { AvailableVar, VarOrigin } from "../core/vars";

// The [$] button next to every field a value is interpolated into. It exists
// because the alternative is remembering that the fetch two steps up was called
// s2 and that its result was saved as "tender" — which is exactly the kind of
// thing a builder should know on the user's behalf.

const HEADINGS: Record<VarOrigin, string> = {
  step: "From this stack",
  builtin: "This page",
  secret: "Secrets"
};

const ORDER: VarOrigin[] = ["step", "builtin", "secret"];

// Inserts at the caret rather than appending: a URL is usually edited in the
// middle, and the value belongs where the cursor is.
function insertAtCaret(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  input.focus();
  // The field's own listener is what writes to the draft, so the edit has to
  // look like typing.
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function varButton(
  input: HTMLInputElement | HTMLTextAreaElement,
  vars: () => AvailableVar[]
): HTMLElement {
  const wrap = h("div", { class: "var-wrap" });
  let menu: HTMLElement | null = null;

  const close = (): void => {
    menu?.remove();
    menu = null;
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onEscape, true);
  };

  function onOutside(e: Event): void {
    if (!wrap.contains(e.target as Node)) close();
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  const open = (): void => {
    const available = vars();
    menu = h("div", { class: "var-menu" });
    if (available.length === 0) {
      menu.append(h("div", { class: "cat", text: "nothing to insert yet" }));
    }
    for (const origin of ORDER) {
      const group = available.filter((v) => v.origin === origin);
      if (group.length === 0) continue;
      menu.append(h("div", { class: "cat", text: HEADINGS[origin] }));
      for (const v of group) {
        menu.append(
          h(
            "button",
            {
              type: "button",
              onClick: () => {
                insertAtCaret(input, `$${v.name}`);
                close();
              }
            },
            h("div", { class: "name", text: `$${v.name}` }),
            h("div", { class: "note", text: v.note })
          )
        );
      }
    }
    wrap.append(menu);
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onEscape, true);
  };

  wrap.append(
    h("button", {
      type: "button",
      class: "var-btn",
      title: "Insert a value",
      text: "$",
      onClick: () => (menu ? close() : open())
    })
  );
  return wrap;
}

import { h } from "./el";

// Reused by the Common card, a site's settings and a fetchUrl step: whether
// Chrome has actually granted the access something here needs, with one
// button to ask for it. The check is async and the row starts blank rather
// than guessing, so it never claims "granted" before it has actually looked.
// `refresh` is returned so a caller can re-check right after its own
// ensureOrigin() call, instead of waiting for the next unrelated render.
//
// The two messages are the caller's, not a label slotted into one sentence:
// a site "will fire", an endpoint "can be called", and bending one phrasing
// to cover both reads worse than passing each.
export function grantStatusRow(
  wording: { granted: string; missing: string },
  check: () => Promise<boolean>,
  request: () => Promise<boolean>
): { element: HTMLElement; refresh: () => void } {
  const text = h("span", { class: "hint" });
  const button = h("button", {
    type: "button",
    class: "btn btn-sm",
    text: "Grant access",
    onClick: () => void request().then(refresh)
  });
  const element = h("div", { class: "field grantrow" }, text, button);

  function refresh(): void {
    void check().then((granted) => {
      text.textContent = granted ? wording.granted : wording.missing;
      button.hidden = granted;
    });
  }
  refresh();
  return { element, refresh };
}


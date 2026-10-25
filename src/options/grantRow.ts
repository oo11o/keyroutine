import { h } from "./el";

// Used by the Common card and a fetchUrl step: whether Chrome has actually
// granted the access something here needs, with one button to ask for it.
// The check is async and the row starts blank rather than guessing, so it
// never claims "granted" before it has actually looked. `refresh` is
// returned so a caller can re-check right after its own ensureOrigin()
// call, instead of waiting for the next unrelated render.
//
// A site's own access is granted through the auto-request checkbox on its
// pattern instead (see sitesPane.ts) — the one case this row is not used
// for, since a site always has a pattern to attach that checkbox to and
// Common and a fetchUrl step do not.
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


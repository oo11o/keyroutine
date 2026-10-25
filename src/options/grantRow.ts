import { h } from "./el";

// Used by a site's own settings, the Common card, and a fetchUrl step:
// whether Chrome has actually granted the access something here needs,
// with one button to ask for it. The check is async and the row starts
// blank rather than guessing, so it never claims "granted" before it has
// actually looked. `refresh` is returned so a caller can re-check right
// after its own ensureOrigin() call, instead of waiting for the next
// unrelated render.
//
// A site also offers a second, lighter path: the auto-request checkbox on
// a new pattern (sitesPane.ts), which asks the moment the pattern is typed
// rather than afterward. This row is what covers the pattern already
// having been added — on purpose, by unchecking that box, or because
// access was revoked some other way — so asking again is never a retype.
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


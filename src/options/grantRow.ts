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
// A site can read as granted for a reason other than its own grant: Common's
// <all_urls> covers every origin, so a site that was never granted itself
// still passes the Chrome check. "common" says so instead of claiming a grant
// that was never actually made for this site, which would read as a ghost
// the next time Common's access is revoked and this site goes dark with it.
export type GrantCheck = boolean | "common";

export function grantStatusRow(
  wording: { granted: string; missing: string; common?: string },
  check: () => Promise<GrantCheck>,
  request: () => Promise<boolean>,
  opts: { buttonClass?: string } = {}
): { element: HTMLElement; refresh: () => void } {
  const text = h("span", { class: "hint" });
  const button = h("button", {
    type: "button",
    class: `btn btn-sm ${opts.buttonClass ?? ""}`.trim(),
    text: "Grant access",
    onClick: () => void request().then(refresh)
  });
  const element = h("div", { class: "field grantrow" }, text, button);

  function refresh(): void {
    void check().then((state) => {
      const granted = state !== false;
      text.textContent =
        state === "common" && wording.common ? wording.common : granted ? wording.granted : wording.missing;
      text.classList.toggle("warntext", !granted);
      button.hidden = granted;
    });
  }
  refresh();
  return { element, refresh };
}


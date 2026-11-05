# Release notes

## 0.2.1

- Fix: a click that submits a form or follows a link no longer loses the
  rest of the routine — the remaining actions are now parked and picked up
  on the next page, the same way "Go to URL (this tab)" already worked.
- Fix: "Go to URL (this tab)" no longer mangles a URL field that is just
  one $variable (e.g. $startUrl) — it's used as the destination directly
  instead of being percent-encoded into an invalid, nested URL.
- Fix: saving no longer blocks on a $variable the routine doesn't produce
  yet — it's a common, harmless case right after pasting in a routine that
  references a Variables-tab entry you haven't added on this profile. Save
  now succeeds and shows what to check.
- "Set field value" and "Save value" now warn against typing a password or
  token straight into the Value field — a literal there travels with the
  routine through Export and Copy JSON, where a Variables-tab $name does
  not.

## 0.2.0

- New "Wait for element" action: polls for a selector to appear instead of
  a fixed-length pause, for pages whose render time varies.
- New "Save value" action: stores a literal or a combination of earlier
  $variables under a name, so later actions can reuse it without repeating
  the template that built it.
- Copy a single routine's JSON to the clipboard from its card, and import
  one routine's JSON as a new routine without replacing the rest of your
  config.

## 0.1.0 — initial release

Initial release of KeyRoutine.

- Bind keyboard shortcuts to custom routines with click, fill, read, fetch,
  and navigate actions.
- Scope routines to specific sites, URL patterns, or all sites, with site
  access requested as needed.
- Detect conflicting keyboard shortcuts on the same page before they cause
  confusion.
- Import and export routine configurations as JSON.
- No account, cloud sync, or telemetry. Routine execution and configuration
  storage stay in your browser.

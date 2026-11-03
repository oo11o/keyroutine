# Release notes

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

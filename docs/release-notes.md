# Release notes

## 0.3.1

- Fix: an "Allow access" button that should have disappeared once access
  was granted stayed on screen instead — fixed for every grant row in the
  builder.
- Fix: a page typed into a routine's "+ path" field could vanish entirely
  if you then switched that routine to "All pages" (or any other page) —
  it's now remembered for the rest of the session.
- The "+ path" field and its add button now sit on one line, and the
  field no longer renders stretched to the full width of the card.
- "Unsaved changes" is now orange and pulses, instead of sitting in plain
  muted text easy to miss.
- Common's explanation text collapses behind a "What is Common?" toggle
  once access is actually granted, instead of repeating itself on every
  visit.

## 0.3.0

- Sites are domains now, and a routine picks which page (or several at
  once) it runs on, instead of needing its own site created for every
  page. Existing configs migrate automatically, and sites that end up
  sharing one domain merge into a single row.
- New "Regex" action: pull a piece out of a larger value — an id out of a
  URL, for example — with a regular expression, no selector needed.
- A red banner now says plainly when nothing has been allowed yet, right
  under the logo, instead of only a quiet lock icon on whichever site you
  happen to be looking at. The button is "Allow access" everywhere, and it
  now actually disappears once access is granted.
- Deleting a site now deletes any of its routines that hold a site-only
  action (like Fetch URL) along with it, instead of leaving them broken
  and unable to save.
- The installed version now shows next to the logo.

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

# KeyRoutine Privacy Policy

_Last updated: 2026-10-22_

KeyRoutine is a Chrome extension that lets you bind keyboard shortcuts to a
sequence of actions you define yourself — click an element, fill a field,
read text, fetch a URL, open a tab — scoped to the sites you choose. This
page explains what KeyRoutine does and does not do with your data.

## KeyRoutine is a local automation tool, not a data-collection service

KeyRoutine is a local browser automation tool. It has no backend, no account,
and no data-collection infrastructure of its own — there is no server
anywhere that KeyRoutine operates, and nothing it does reports back to its
developer or to any third party. Everything described below happens
entirely inside your own browser, on your own machine.

Every action a routine performs, and every external request it makes, is one
you configured yourself. KeyRoutine does not decide on its own to read a page,
click an element, or contact a URL — it only ever does what the routine you
built tells it to do, on the sites you explicitly granted it access to. In
other words: KeyRoutine supplies the mechanism for automation; the content of
that automation — which pages, which elements, which URLs — is entirely
user-authored. This is why KeyRoutine has nothing resembling user analytics,
telemetry, or any pipeline that would collect data about you or your
browsing: there is no infrastructure in KeyRoutine for collecting anything,
by design, not merely by configuration.

In fact, KeyRoutine ships with exactly one built-in behavior: listening for
the keyboard shortcut you've bound, and matching it to a routine. It does not
come with any pre-built automation, site integration, or default action of
its own. Every action type (click an element, fill a field, read text,
fetch a URL, open a tab, and so on) is a generic building block; it does
nothing until you — the user — assemble some of them into a routine in the
options page. That's the whole point of KeyRoutine: it lets you automate your
own repetitive actions yourself, so a sequence you'd otherwise click through
by hand runs instantly behind a hotkey of your choosing.

## What KeyRoutine stores, and where

Everything KeyRoutine stores lives in `chrome.storage.local` / `.session` —
storage private to the extension, readable only by KeyRoutine itself, never
by the web pages you visit:

- **Your routines.** The hotkeys and action sequences you build in the
  options page.
- **Your variables.** Values you save on the Variables tab (an API token,
  a base URL, a test password — whatever a routine of yours needs to
  reference by name). These are stored in plain text. KeyRoutine has no
  server, so there is no form of encryption that would make this more
  secure than the device it's stored on — anyone with access to your
  browser's devtools could read them, same as any other browser storage.
  What storing them this way does buy you: they never touch the extension's
  bundled config file, so they can't be read by any web page, and they're
  never written into a routine you export or share.
- **A short-lived resume record**, only while a routine is mid-run and has
  just navigated to a new page. It holds the variables that routine had
  produced so far, and is deleted the moment the routine finishes or expires
  (a few minutes).

None of this is ever transmitted anywhere by KeyRoutine itself.

## What a routine you build might do

KeyRoutine asks for nothing when you install it. The first time you point a
routine at a site — or choose "Everywhere" for one that should work on every
site — Chrome asks you to confirm access to exactly that site, and only
that site, before KeyRoutine can act on it: reading the page's URL, title, or
current selection; reading or writing an element you've pointed it at;
fetching a URL or opening a tab. A routine only ever does what you
configured it to do — for instance, a `fetchUrl`
step you build yourself requests exactly the URL you entered, optionally
with one of your own variables substituted in. KeyRoutine does not read,
collect, or transmit anything from a site you haven't granted it access to —
and any site in your list that you haven't granted is marked as such, so you
can see at a glance where KeyRoutine cannot act.

Granting access to an address a `fetchUrl` step calls is deliberately not
the same as adding it as a site: KeyRoutine runs its page code only where you
pointed a routine, so a host you only wanted to *call* is called and nothing
more — no keyboard listener and no page reading on it.

## Data KeyRoutine does not collect

KeyRoutine does not collect your location, health information, financial
information, personal communications, or browsing history. It does not sell
data, share data with third parties, or use any data for purposes unrelated
to running the routines you've built — including for creditworthiness or
lending decisions.

## Changes to this policy

If this policy changes, the date at the top of this page will change with
it. Material changes will also be noted in the extension's Chrome Web
Store listing.

## Contact

Questions about this policy, feedback, or bug reports: use
[this form](https://tally.so/r/o9bqEx).

# Chrome Web Store listing copy

## Short description (max 132 characters)

> Bind hotkeys to your own click/fill/read/fetch sequences, scoped to the sites you choose.

(91 characters — room to spare if a reviewer asks for more specificity.)

## Detailed description

KeyRoutine turns a keyboard shortcut into whatever sequence of actions you'd
otherwise do by hand: click a button, fill a field, read an element's text,
fetch a URL, open a tab, wait for a popup to confirm it ran. You build the
sequence once in the options page and fire it with a hotkey from then on.

**Built for repeat work on sites you use every day.** Point a hotkey at a
site (or just a section of it — "this domain," "this URL," or everywhere),
and it only shows up where it applies. If two of your routines would ever
claim the same hotkey on the same page, KeyRoutine tells you which one wins
before you find out the hard way.

**No access until you grant it.** KeyRoutine asks for nothing at install.
The first time you point a routine at a site, Chrome asks you to confirm
access to that site — and only that site — right there in the builder.

**Your data stays yours.** KeyRoutine has no server. Everything you build —
your routines, and any variables you save (an API token, a base URL, a test
password) — lives in your browser's local storage, never in a file that
could be read by a page you visit, and is never sent anywhere except where
a routine you wrote yourself tells it to go. See the privacy policy for the
full breakdown.

**What you can chain together:**
- Click or fill an element you've picked on the page
- Read an element's text into a variable later actions can use
- Fetch a URL or open it in a new or current tab
- Navigate the current tab, with the routine resuming after the page loads
- Show a popup to confirm a routine ran, or to surface what it found

**No account, no sync, no telemetry.** Install it, open the options page,
build your first routine, and press the hotkey.

## Complete action list (paste into the review form if asked what KeyRoutine can do)

Eleven action types, all of them inert until a user puts one in a routine of
their own. Nothing here runs on install, and nothing runs on a site the user
has not granted. Grouped as the builder groups them.

**Read**
| Action | What it does | Result |
|---|---|---|
| Read element | Reads the value or text of an element the user picked. **Only available in a routine scoped to a site** | `$text` |
| Fetch URL | Requests a user-entered URL through the service worker, so the page's CORS rules do not apply. One request at a time. **Only available in a routine scoped to a site** | `$response` |

**Act on the page**
| Action | What it does | Result |
|---|---|---|
| Set field value | Sets an input's value through the native setter and fires `input`/`change`. **Only available in a routine scoped to a site** | — |
| Focus element | Moves keyboard focus to an element. **Only available in a routine scoped to a site** | — |
| Click element | Clicks an element. **Only available in a routine scoped to a site** | — |
| Press key | Sends one `KeyboardEvent.key` to whatever has focus. **Only available in a routine scoped to a site** | — |

**Wait**
| Action | What it does | Result |
|---|---|---|
| Wait (fixed) | A flat pause, capped at 30 seconds | — |

**Show**
| Action | What it does | Result |
|---|---|---|
| Show popup | An in-page panel that blocks the routine until the user dismisses it | — |
| Show popup (JSON) | The same panel with a live line filter, for long bodies | — |

**Navigate**
| Action | What it does | Result |
|---|---|---|
| Open URL in a new tab | Opens a user-entered URL in a new tab; this page keeps running the routine | — |
| Go to URL (this tab) | Leaves this page; the remaining actions resume on the next page in this tab, within 15 seconds | — |

A site rule also may not claim every website — `*` is refused — so "scoped
to a site" always names somewhere.

**Six of the eleven cannot exist in a Common ("everywhere") routine:** Fetch
URL, and every action that names a CSS selector (Read element, Set field
value, Focus element, Click element, Press key). A Common routine fires on
every page, so there is no site rule to say what a selector written for one
page's markup was for, or what an outbound request was for — either way,
nothing says it was meant to run *here*. The builder does not offer these six
types in a Common routine, a routine holding one cannot be moved to Common,
importing or saving such a config is refused, and the runner refuses the
action outright — so neither an import nor a hand-edited storage entry can
get one of these six to run unscoped. What Common may still hold: Wait, both
popups, and both navigate actions — nothing that depends on a specific
page's structure.

Worth noting for a reviewer: every URL, selector and value above is typed by
the user. Two actions produce a variable (`Read element`, `Fetch URL`), each
under a short name the builder generates and the user can change in that
action's "Save as" box; the
other nine return nothing. No action writes to the clipboard, reads browsing
history, or reaches a site outside the user's own granted rules.

## Screenshots

Taken with `docs/screenshot-config.json` loaded, so nothing real appears in
any of them. The Store wants 1280×800 or 640×400, 24-bit PNG with no alpha.

| File | Shows | Status |
|---|---|---|
| `screenshots/listing-1-builder-1280x800.png` | Re-shot. The primary frame: all three columns, "Fill test login" now correctly site-scoped, "Order as JSON" and the open "Save, then back to the list" with its click → wait → navigate pipeline on the right. Saved draft, nothing in an error state | ready |
| `screenshots/listing-2-site-only-fetch-1280x800.png` | **Stale — taken before the rename, says Keystack/Stacks.** The same builder with a fetch routine open, showing the rule in the Site field: a routine holding Fetch URL cannot move to Common | re-shoot |
| `screenshots/*-original.png` | The unpadded sources, kept to re-cut from, never for upload | source |

Still worth shooting:

- The Fetch URL card open on an **ungranted** host, so "Granting this lets it call the host, not run on its pages" is visible — the privacy story in one frame.
- A popup fired by a hotkey on a real page, which is the only frame showing KeyRoutine doing its job rather than being configured.
- The action menu open, which is the only frame showing the whole vocabulary. The one taken so far is cropped to 589×668 and cut mid-row; it needs the full window.
- Optionally the Sites list with a "Not granted" chip, showing nothing is reachable until it is granted.

All frames are padded to 1280×800 at the bottom with the page background
(`#121214`), so the window reads as continuing rather than being cut.

## Category

Productivity (secondary: Developer Tools, if the Store allows one)

## Privacy policy URL

https://oo11o.github.io/keyroutine/privacy-policy/

Served from `docs/privacy-policy/index.html` via GitHub Pages (source:
`master` branch, `/docs` path). Paste this into the Developer Dashboard's
Privacy policy field.

## Support URL

https://tally.so/r/o9bqEx

A Tally.so form for feedback or bug reports. Paste this into the Developer
Dashboard's Support URL field; it's also linked from the privacy policy's
Contact section.

## Permission justifications (for the Developer Dashboard form)

**Optional host permission — `<all_urls>`:**
> Not granted at install. KeyRoutine's hotkeys run user-defined action
> sequences (click, fill, read, fetch, navigate) against whatever page the
> user is on, scoped by the user's own site rules — so access to a given
> site is requested, via `chrome.permissions.request()`, only when the user
> adds that site (or chooses "Everywhere") from the Sites tab. The action
> that makes an outbound request ("Fetch URL") is available only inside a
> routine the user scoped to a site, never in an "Everywhere" routine. No site is
> reachable before the user names it, and the Sites tab flags any site whose
> access has not been granted, so the user can always see which of their own
> rules are inert.

**`scripting`:**
> Registers the content script (`chrome.scripting.registerContentScripts`)
> against exactly the origins the user has granted *and* pointed a site
> rule at, instead of declaring it statically against every site in the
> manifest. A host granted only so a user's "fetch URL" action can call it
> is never injected into: calling an API and reading its pages are kept
> separate in code.

**`storage`:**
> Stores the user's own routines and variables (e.g. an API token referenced
> by name in a routine) locally, so hotkeys work without a server and
> without re-entering values on every browser restart. Nothing stored here
> is transmitted by the extension itself.

KeyRoutine declares no `clipboardWrite`: no action a routine can run writes to
the clipboard. The one copy left is the builder's own export button, a click
on the extension's own options page, which needs no clipboard permission.

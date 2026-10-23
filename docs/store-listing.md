# Chrome Web Store listing copy

## Short description (max 132 characters)

> Bind hotkeys to your own click/fill/read/fetch sequences, scoped to the sites you choose.

(91 characters — room to spare if a reviewer asks for more specificity.)

## Detailed description

Keystack turns a keyboard shortcut into whatever sequence of actions you'd
otherwise do by hand: click a button, fill a field, read an element's text,
fetch a URL, open a tab, wait for a popup to confirm it ran. You build the
sequence once in the options page and fire it with a hotkey from then on.

**Built for repeat work on sites you use every day.** Point a hotkey at a
site (or just a section of it — "this domain," "this URL," or everywhere),
and it only shows up where it applies. If two of your stacks would ever
claim the same hotkey on the same page, Keystack tells you which one wins
before you find out the hard way.

**No access until you grant it.** Keystack asks for nothing at install.
The first time you point a stack at a site, Chrome asks you to confirm
access to that site — and only that site — right there in the builder.

**Your data stays yours.** Keystack has no server. Everything you build —
your stacks, and any variables you save (an API token, a base URL, a test
password) — lives in your browser's local storage, never in a file that
could be read by a page you visit, and is never sent anywhere except where
a stack you wrote yourself tells it to go. See the privacy policy for the
full breakdown.

**What you can chain together:**
- Click or fill an element you've picked on the page
- Read an element's text into a variable later actions can use
- Fetch a URL or open it in a new or current tab
- Navigate the current tab, with the stack resuming after the page loads
- Show a popup to confirm a stack ran, or to surface what it found

**No account, no sync, no telemetry.** Install it, open the options page,
build your first stack, and press the hotkey.

## Complete action list (paste into the review form if asked what Keystack can do)

Eleven action types, all of them inert until a user puts one in a stack of
their own. Nothing here runs on install, and nothing runs on a site the user
has not granted. Grouped as the builder groups them.

**Read**
| Action | What it does | Result |
|---|---|---|
| Read element | Reads the value or text of an element the user picked | `$text` |
| Fetch URL | Requests a user-entered URL through the service worker, so the page's CORS rules do not apply. One request at a time. **Only available in a stack scoped to a site** | `$response` |

**Act on the page**
| Action | What it does | Result |
|---|---|---|
| Set field value | Sets an input's value through the native setter and fires `input`/`change` | — |
| Focus element | Moves keyboard focus to an element | — |
| Click element | Clicks an element | — |
| Press key | Sends one `KeyboardEvent.key` to whatever has focus | — |

**Wait**
| Action | What it does | Result |
|---|---|---|
| Wait (fixed) | A flat pause, capped at 30 seconds | — |

**Show**
| Action | What it does | Result |
|---|---|---|
| Show popup | An in-page panel that blocks the stack until the user dismisses it | — |
| Show popup (JSON) | The same panel with a live line filter, for long bodies | — |

**Navigate**
| Action | What it does | Result |
|---|---|---|
| Open URL in a new tab | Opens a user-entered URL in a new tab; this page keeps running the stack | — |
| Go to URL (this tab) | Leaves this page; the remaining actions resume on the next page in this tab, within 15 seconds | — |

**Fetch URL cannot exist in a Common ("everywhere") stack.** A Common stack
fires on every page, so there is no site rule to say what it was for; an
action that reaches off the page therefore has to live in a stack the user
scoped to a specific site. The builder does not offer the type there, a
stack holding one cannot be moved to Common, saving such a config is
refused, and the runner refuses the action outright — so neither an import
nor a hand-edited storage entry can get a fetch to run unscoped.

Worth noting for a reviewer: every URL, selector and value above is typed by
the user. Two actions produce a variable (`Read element`, `Fetch URL`); the
other nine return nothing. No action writes to the clipboard, reads browsing
history, or reaches a site outside the user's own granted rules.

Retired types still accepted from an older config and rewritten on load
(`migrateStep` in `src/core/configStore.ts`): `copyBySelector` → Read
element, `typeToSelector` → Set field value, `waitForSelector` → Wait.

## Category

Productivity (secondary: Developer Tools, if the Store allows one)

## Privacy policy URL

(Fill in once `docs/privacy-policy.md` is hosted — see the submission
checklist's open decision on where.)

## Permission justifications (for the Developer Dashboard form)

**Optional host permission — `<all_urls>`:**
> Not granted at install. Keystack's hotkeys run user-defined action
> sequences (click, fill, read, fetch, navigate) against whatever page the
> user is on, scoped by the user's own site rules — so access to a given
> site is requested, via `chrome.permissions.request()`, only when the user
> adds that site (or chooses "Everywhere") from the Sites tab. The action
> that makes an outbound request ("Fetch URL") is available only inside a
> stack the user scoped to a site, never in an "Everywhere" stack. No site is
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
> Stores the user's own stacks and variables (e.g. an API token referenced
> by name in a stack) locally, so hotkeys work without a server and
> without re-entering values on every browser restart. Nothing stored here
> is transmitted by the extension itself.

Keystack declares no `clipboardWrite`: no action a stack can run writes to
the clipboard. The one copy left is the builder's own export button, a click
on the extension's own options page, which needs no clipboard permission.

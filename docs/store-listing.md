# Chrome Web Store listing copy

## Short description (max 132 characters)

> Bind hotkeys to your own click/fill/copy/fetch sequences, scoped to the sites you choose.

(91 characters — room to spare if a reviewer asks for more specificity.)

## Detailed description

Keystack turns a keyboard shortcut into whatever sequence of actions you'd
otherwise do by hand: click a button, fill a field, copy an element's text,
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
- Copy an element's text to the clipboard
- Read a value into a variable for later steps to use
- Fetch a URL or open it in a new or current tab
- Navigate the current tab, with the stack resuming after the page loads
- Show a popup to confirm a stack ran, or to surface what it found

**No account, no sync, no telemetry.** Install it, open the options page,
build your first stack, and press the hotkey.

## Category

Productivity (secondary: Developer Tools, if the Store allows one)

## Privacy policy URL

(Fill in once `docs/privacy-policy.md` is hosted — see the submission
checklist's open decision on where.)

## Permission justifications (for the Developer Dashboard form)

**Optional host permission — `<all_urls>`:**
> Not granted at install. Keystack's hotkeys run user-defined action
> sequences (click, fill, copy, fetch, navigate) against whatever page the
> user is on, scoped by the user's own site rules — so access to a given
> site is requested, via `chrome.permissions.request()`, only when the user
> adds that site (or chooses "Everywhere") from the Sites tab. No site is
> reachable before the user names it, and the Sites tab flags any site whose
> access has not been granted, so the user can always see which of their own
> rules are inert.

**`scripting`:**
> Registers the content script (`chrome.scripting.registerContentScripts`)
> against exactly the origins the user has granted, instead of declaring it
> statically against every site in the manifest.

**`storage`:**
> Stores the user's own stacks and variables (e.g. an API token referenced
> by name in a stack) locally, so hotkeys work without a server and
> without re-entering values on every browser restart. Nothing stored here
> is transmitted by the extension itself.

**`clipboardWrite`:**
> Backs the "copy element to clipboard" step and the options page's
> export-to-clipboard button — both triggered directly by a user action
> (a hotkey press or a button click).

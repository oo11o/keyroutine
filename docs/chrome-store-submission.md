# Chrome Web Store submission checklist

What Google actually requires to list KeyRoutine, and where the current
manifest stands against it.

## Manifest / code — audited against `public/manifest.json` + `src/`

| Item | Status | Notes |
|---|---|---|
| Manifest V3 | ✅ | Already on MV3, no remote code, no `eval`. |
| `permissions: ["storage", "scripting"]` | ✅ used | `storage` → `chrome.storage.local`/`.session` (config, vars, resume). `scripting` → registering the content script dynamically (see below), instead of declaring it statically against every site. `clipboardWrite` was dropped, along with the clipboard action itself: no routine writes to the clipboard any more. The one remaining copy is the builder's own export button (`src/options/portJson.ts`), a click on an extension page, where `navigator.clipboard.writeText` needs no permission. |
| `optional_host_permissions: ["<all_urls>"]` | ✅ | No permission is granted at install. A user grants access per-site (or, once, for "Everywhere" routines) from the Sites tab — `chrome.permissions.request()`, called directly from that click. The content script is then registered against the granted origins a *site* points at, not against everything granted (`injectableOrigins` in `src/core/match.ts`, used by `src/background/contentScripts.ts`) — see "Reading a page and calling an API are separate" below. This replaced a static `host_permissions: ["<all_urls>"]` + `content_scripts` entry that ran on every page from install onward. |
| `web_accessible_resources` | ✅ not declared at all | Used to list `config/settings.json`, so every page could fetch it. That read is now done by the service worker (`background/worker.ts`, `LOAD_SETTINGS_MESSAGE_TYPE` in `background/protocol.ts`) and handed to the content script over `chrome.runtime.sendMessage` — a privileged context can load its own bundled file with no manifest exposure at all. `config/routines.json` was never listed here either. The manifest key is gone, not just narrowed. |
| Icons | ✅ | 16/32/48/128 present as of the icon commit. |
| CSP / inline scripts | ✅ | Options page already uses a separate bundle instead of inline `<script>` (manifest V3 forbids it anyway). |

This is the strongest position to submit from: Google's review explicitly
favors `optional_host_permissions` requested at the moment of use over a
blanket `host_permissions: ["<all_urls>"]` declared at install. The
justification text in the Developer Dashboard's permissions form should say
exactly that — see the single-purpose statement below.

## Reading a page and calling an API are separate

Chrome's grant does not distinguish the two: a granted origin authorises both
injecting a content script into its pages and calling it from the worker.
KeyRoutine narrows that itself, in code:

- `injectableOrigins(granted, sites)` (`src/core/match.ts`) returns the
  granted origins that a site in the user's config actually points at, plus
  `<all_urls>` when the user chose "Everywhere". That is the content
  script's entire match list.
- A `fetchUrl` step's host is granted from the step's own card in the
  builder, not by adding it as a site. So an API the user only wants to
  *call* is granted, the worker's fetch check (`src/background/worker.ts`)
  passes for it, and no content script is ever registered on its pages —
  no key listener, no DOM read.
- The registration is re-derived whenever a grant changes *and* whenever the
  config changes, since adding a site to an already-granted host has no
  permission event behind it.

Worth stating plainly in the review notes: the narrowing is enforced by
KeyRoutine declining to register the script, not by the permission Chrome
issued. The permission prompt the user sees is the same either way.

The same principle applies to the one action that makes an outbound request:
**Fetch URL may only appear in a routine scoped to a site, never in a Common
("everywhere") one.** A Common routine fires on every page, so nothing in the
config says what such a request was for. The rule is enforced at four
layers, deliberately not just in the UI:

1. the builder does not offer the type in a Common routine (`src/options/stepsPane.ts`), and flags one already there;
2. a routine holding it cannot be moved to Common (`blocksCommon` in `src/options/store.ts`, the Site dropdown in `src/options/routinesPane.ts`);
3. Import refuses such a config outright, in the import dialog, leaving the draft untouched — and `store.save()` checks the same rule again, for a draft that was edited some other way;
4. the runner refuses the action before dispatching it (`src/content/runner.ts`), so editing `chrome.storage.local` by hand does not get a fetch to run unscoped.

`siteOnlySteps` / `siteOnlyReason` in `src/core/stepMeta.ts` are the single
definition all four read, so the UI and the executor cannot drift apart.

The rule leans on a site actually naming where it reaches, so the obvious way
round it is closed too: **a site pattern may not claim every website.** `*`,
`*://*/*` and `example.*` are refused when typed, refused on Save and Import,
and match nothing at run time if a hand-edited config carries one
(`overBroadPattern` in `src/core/match.ts`). Without that, a "site" whose
pattern is `*` would be Common wearing a site's clothes, and a fetch scoped
to it would reach every page after all.

## Data handling — what has to be disclosed

KeyRoutine stores Variables-tab values (`chrome.storage.local`) in plaintext,
locally, un-transmitted except when a routine the user built explicitly
substitutes one into a URL or request. There's no server and nothing is
sent anywhere by the extension itself.

Even so, the Store's "Privacy practices" tab requires an affirmative answer
for any category that's *stored*, not just transmitted. That means declaring:

- **Authentication information** (the vars/tokens a user saves) — collected: yes, sold: no, used only for the extension's stated function.
- **Website content** (DOM reads for steps like "read element") — same.
- Everything else (location, health, financial, personal comms, web history) — no.

This also requires certifying compliance with the **Limited Use** policy
(no selling data, no use outside the extension's function, no use for
credit/lending decisions) and providing a **hosted privacy policy URL** —
live at https://oo11o.github.io/keyroutine/privacy-policy/.

## What changed for an existing install

A profile that already had routines configured before this change has none of
the new per-site grants — the old `host_permissions: ["<all_urls>"]` covered
everything, so nothing needed asking. After updating, every site a routine
was scoped to is marked "Not granted" in the Sites list — the list marks only
the sites that still need a grant, so after updating the remaining work is
exactly what is still flagged. This is a one-time cost of the narrower
permission model and is worth calling out in the update's release notes
rather than letting it surface as "my hotkeys stopped working."

**Open problem, not yet solved:** the standalone "Grant access" row/button
(site settings, Common, a Fetch URL step) was removed from the builder. A new
pattern typed with the auto-request checkbox on still asks Chrome
immediately, same as before — but that is now the *only* path left. A site
granted before this change keeps working, but a profile updating into this
state, Common, and any Fetch URL step have no button anywhere to ask Chrome
for access. Needs a replacement before this ships, or Common/fetchUrl are
permanently inert for anyone who was not already granted.

## Listing assets still needed

- Short description, ≤132 characters.
- Detailed description — lead with the single-purpose statement (see below), Google's reviewers check the listing against it.
- At least one screenshot, 1280×800 or 640×400. One is ready: `docs/screenshots/listing-1280x800.png` (the builder with the demo config loaded). `docs/screenshot-config.json` is that config — reserved example.com/example.org hosts only, one routine per feature worth a frame (the call-only fetch grant among them). See "Screenshots" in the listing doc for what is shot and what is still missing.
- Category: Productivity (or Developer Tools).
- Privacy policy URL: https://oo11o.github.io/keyroutine/privacy-policy/ (done).

## Architecture note for reviewers (paste into the Data Usage justification field)

> KeyRoutine is a local browser automation tool with no data-collection
> infrastructure of its own: it has no backend, no account system, and no
> telemetry or analytics pipeline. All data handling that happens is
> entirely user-configured — the user builds a "routine" (a named sequence of
> actions bound to a hotkey) themselves, and only that routine's own steps
> ever read page content, write to storage, or make an external request.
> KeyRoutine itself never decides what to read or where to send it; it only
> executes the exact steps and URLs the user authored, on sites the user
> explicitly granted access to. There is accordingly no mechanism by which
> KeyRoutine could collect user data beyond what the user's own configuration
> already does on their behalf.
>
> KeyRoutine ships with exactly one built-in behavior out of the box:
> listening for a keyboard shortcut and matching it to a routine. It includes
> no pre-built automation and no default action of any kind — every action
> type (click, fill, read, fetch, navigate, …) is a generic, inert building
> block until the user assembles some of them into a routine themselves. The
> extension's entire purpose is letting a user automate their own repetitive
> actions behind a hotkey; it does not act on its own behalf in any way.

## Single-purpose statement (for the review form, not the listing)

> KeyRoutine lets a user bind keyboard shortcuts to a sequence of actions
> (click, fill, read, fetch, navigate) they define themselves, scoped to
> the sites they choose. No site is reachable until the user explicitly
> grants it from the Sites tab — there is no permission active at install
> that the user has not asked for by name. Nothing is collected or
> transmitted beyond what the user's own routine does.

If the review form asks what the extension can actually do, the full action
inventory is in `docs/store-listing.md` ("Complete action list") — eleven
types, two of which produce a value, none of which runs on its own.

The order of what is left — merges, hosting, assets, the bugs found while
preparing all this — is in `docs/release-roadmap.md`.

## Open decisions (not mine to make)

1. ~~Where to host the privacy policy~~ — closed. Live at
   https://oo11o.github.io/keyroutine/privacy-policy/ via GitHub Pages
   (`master` branch, `/docs` path), serving `docs/privacy-policy/index.html`.
2. ~~Whether `clipboardWrite` is still needed~~ — closed by removing the
   clipboard action ("Copy element to clipboard") outright, so nothing a
   routine does touches the clipboard and the permission has no call site
   left. A config written before this has its copy steps rewritten to the
   plain "Read element" on load (`migrateStep` in `src/core/configStore.ts`)
   — lossy by design: the read survives, the clipboard write does not. Worth
   a line in the release notes.

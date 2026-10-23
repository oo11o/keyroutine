# Chrome Web Store submission checklist

What Google actually requires to list Keystack, and where the current
manifest stands against it.

## Manifest / code — audited against `public/manifest.json` + `src/`

| Item | Status | Notes |
|---|---|---|
| Manifest V3 | ✅ | Already on MV3, no remote code, no `eval`. |
| `permissions: ["storage", "scripting"]` | ✅ used | `storage` → `chrome.storage.local`/`.session` (config, vars, resume). `scripting` → registering the content script dynamically (see below), instead of declaring it statically against every site. `clipboardWrite` was dropped, along with the clipboard action itself: no stack writes to the clipboard any more. The one remaining copy is the builder's own export button (`src/options/portJson.ts`), a click on an extension page, where `navigator.clipboard.writeText` needs no permission. |
| `optional_host_permissions: ["<all_urls>"]` | ✅ | No permission is granted at install. A user grants access per-site (or, once, for "Everywhere" stacks) from the Sites tab — `chrome.permissions.request()`, called directly from that click. The content script is then registered against the granted origins a *site* points at, not against everything granted (`injectableOrigins` in `src/core/match.ts`, used by `src/background/contentScripts.ts`) — see "Reading a page and calling an API are separate" below. This replaced a static `host_permissions: ["<all_urls>"]` + `content_scripts` entry that ran on every page from install onward. |
| `web_accessible_resources` → `config/settings.json` | ✅ | Deliberately excludes the vars/secrets store — see the comment in `src/core/context.ts`. Worth restating in the review notes since it's exactly the kind of thing a reviewer checks by hand. |
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
Keystack narrows that itself, in code:

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
Keystack declining to register the script, not by the permission Chrome
issued. The permission prompt the user sees is the same either way.

The same principle applies to the one action that makes an outbound request:
**Fetch URL may only appear in a stack scoped to a site, never in a Common
("everywhere") one.** A Common stack fires on every page, so nothing in the
config says what such a request was for. The rule is enforced at four
layers, deliberately not just in the UI:

1. the builder does not offer the type in a Common stack (`src/options/stepsPane.ts`), and flags one already there;
2. a stack holding it cannot be moved to Common (`blocksCommon` in `src/options/store.ts`, the Site dropdown in `src/options/stacksPane.ts`);
3. saving a config that holds one is refused, which covers Import and a pasted config (`store.save()`);
4. the runner refuses the action before dispatching it (`src/content/runner.ts`), so editing `chrome.storage.local` by hand does not get a fetch to run unscoped.

`siteOnlySteps` / `siteOnlyReason` in `src/core/stepMeta.ts` are the single
definition all four read, so the UI and the executor cannot drift apart.

## Data handling — what has to be disclosed

Keystack stores Variables-tab values (`chrome.storage.local`) in plaintext,
locally, un-transmitted except when a stack the user built explicitly
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
there isn't one yet; it needs a static page somewhere (GitHub Pages is the
easy option since there's no backend) before the listing can be submitted.

## What changed for an existing install

A profile that already had stacks configured before this change has none of
the new per-site grants — the old `host_permissions: ["<all_urls>"]` covered
everything, so nothing needed asking. After updating, every site a stack
was scoped to is marked "Not granted" in the Sites list and shows "Not
granted yet" on its settings card until the user clicks "Grant access"
there (or on Common, for an "everywhere" stack). The list marks only the
sites that still need a grant — once one is granted, its row carries no
badge at all — so after updating, the remaining work is exactly what is
still flagged. This is a one-time cost of the narrower permission model and
is worth calling out in the update's release notes rather than letting it
surface as "my hotkeys stopped working."

## Listing assets still needed

- Short description, ≤132 characters.
- Detailed description — lead with the single-purpose statement (see below), Google's reviewers check the listing against it.
- At least one screenshot, 1280×800 or 640×400.
- Category: Productivity (or Developer Tools).
- Privacy policy URL (see above).

## Architecture note for reviewers (paste into the Data Usage justification field)

> Keystack is a local browser automation tool with no data-collection
> infrastructure of its own: it has no backend, no account system, and no
> telemetry or analytics pipeline. All data handling that happens is
> entirely user-configured — the user builds a "stack" (a named sequence of
> actions bound to a hotkey) themselves, and only that stack's own steps
> ever read page content, write to storage, or make an external request.
> Keystack itself never decides what to read or where to send it; it only
> executes the exact steps and URLs the user authored, on sites the user
> explicitly granted access to. There is accordingly no mechanism by which
> Keystack could collect user data beyond what the user's own configuration
> already does on their behalf.
>
> Keystack ships with exactly one built-in behavior out of the box:
> listening for a keyboard shortcut and matching it to a stack. It includes
> no pre-built automation and no default action of any kind — every action
> type (click, fill, read, fetch, navigate, …) is a generic, inert building
> block until the user assembles some of them into a stack themselves. The
> extension's entire purpose is letting a user automate their own repetitive
> actions behind a hotkey; it does not act on its own behalf in any way.

## Single-purpose statement (for the review form, not the listing)

> Keystack lets a user bind keyboard shortcuts to a sequence of actions
> (click, fill, read, fetch, navigate) they define themselves, scoped to
> the sites they choose. No site is reachable until the user explicitly
> grants it from the Sites tab — there is no permission active at install
> that the user has not asked for by name. Nothing is collected or
> transmitted beyond what the user's own stack does.

If the review form asks what the extension can actually do, the full action
inventory is in `docs/store-listing.md` ("Complete action list") — eleven
types, two of which produce a value, none of which runs on its own.

## Open decisions (not mine to make)

1. Where to host the privacy policy (GitHub Pages under this repo is the
   obvious zero-infra choice, but it's a judgment call).
2. ~~Whether `clipboardWrite` is still needed~~ — closed by removing the
   clipboard action ("Copy element to clipboard") outright, so nothing a
   stack does touches the clipboard and the permission has no call site
   left. A config written before this has its copy steps rewritten to the
   plain "Read element" on load (`migrateStep` in `src/core/configStore.ts`)
   — lossy by design: the read survives, the clipboard write does not. Worth
   a line in the release notes.

# Chrome Web Store submission checklist

What Google actually requires to list Keystack, and where the current
manifest stands against it.

## Manifest / code — audited against `public/manifest.json` + `src/`

| Item | Status | Notes |
|---|---|---|
| Manifest V3 | ✅ | Already on MV3, no remote code, no `eval`. |
| `permissions: ["clipboardWrite", "storage", "scripting"]` | ✅ used | `storage` → `chrome.storage.local`/`.session` (config, vars, resume). `clipboardWrite` → the copy-to-clipboard step and the export dialog's copy button, both fired from a user action. `scripting` → registering the content script dynamically (see below), instead of declaring it statically against every site. |
| `optional_host_permissions: ["<all_urls>"]` | ✅ | No permission is granted at install. A user grants access per-site (or, once, for "Everywhere" stacks) from the Sites tab — `chrome.permissions.request()`, called directly from that click — and the background worker registers the content script against exactly what has been granted (`src/background/contentScripts.ts`). This replaced a static `host_permissions: ["<all_urls>"]` + `content_scripts` entry that ran on every page from install onward. |
| `web_accessible_resources` → `config/settings.json` | ✅ | Deliberately excludes the vars/secrets store — see the comment in `src/core/context.ts`. Worth restating in the review notes since it's exactly the kind of thing a reviewer checks by hand. |
| Icons | ✅ | 16/32/48/128 present as of the icon commit. |
| CSP / inline scripts | ✅ | Options page already uses a separate bundle instead of inline `<script>` (manifest V3 forbids it anyway). |

This is the strongest position to submit from: Google's review explicitly
favors `optional_host_permissions` requested at the moment of use over a
blanket `host_permissions: ["<all_urls>"]` declared at install. The
justification text in the Developer Dashboard's permissions form should say
exactly that — see the single-purpose statement below.

## Data handling — what has to be disclosed

Keystack stores Variables-tab values (`chrome.storage.local`) in plaintext,
locally, un-transmitted except when a stack the user built explicitly
substitutes one into a URL or request. There's no server and nothing is
sent anywhere by the extension itself.

Even so, the Store's "Privacy practices" tab requires an affirmative answer
for any category that's *stored*, not just transmitted. That means declaring:

- **Authentication information** (the vars/tokens a user saves) — collected: yes, sold: no, used only for the extension's stated function.
- **Website content** (selection/DOM reads for steps like "copy element") — same.
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
> type (click, fill, copy, fetch, navigate, …) is a generic, inert building
> block until the user assembles some of them into a stack themselves. The
> extension's entire purpose is letting a user automate their own repetitive
> actions behind a hotkey; it does not act on its own behalf in any way.

## Single-purpose statement (for the review form, not the listing)

> Keystack lets a user bind keyboard shortcuts to a sequence of actions
> (click, fill, copy, fetch, navigate) they define themselves, scoped to
> the sites they choose. No site is reachable until the user explicitly
> grants it from the Sites tab — there is no permission active at install
> that the user has not asked for by name. Nothing is collected or
> transmitted beyond what the user's own stack does.

## Open decisions (not mine to make)

1. Where to host the privacy policy (GitHub Pages under this repo is the
   obvious zero-infra choice, but it's a judgment call).
2. Whether `clipboardWrite` is still needed once the gesture requirement is
   checked against actual Clipboard API behavior — worth a quick manual
   test rather than removing it speculatively.

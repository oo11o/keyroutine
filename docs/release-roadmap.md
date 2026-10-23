# Road to the Chrome Web Store

What is left between the code as it stands and a submitted listing, in the
order it has to happen. Each item says how to know it is done — a roadmap
whose items cannot be checked is a wish list.

Status as of 2026-10-23: the extension itself is submission-shaped (narrow
permissions, no clipboard, fetch scoped to a site). What is missing is
almost entirely around it — hosting, assets, a merge, and one real bug.

---

## Phase 0 — get the work onto master

Nothing else can be released from where the work currently sits.

- [ ] **Merge the branch chain, in order.** Three topic branches are stacked:
      `chore/chrome-store-submission` → `feat/site-only-fetch` →
      `fix/import-dialog-focus`. Master is 32 commits behind the tip.
      Merging out of order drags another branch's commits into the wrong PR.
      *Done when:* `git log master..fix/import-dialog-focus` is empty.
- [ ] **Decide the version.** Manifest and `package.json` say 0.6.0, and the
      last tag is v0.2.2. This release removes a step type, narrows every
      permission and changes where fetch may live — a minor bump at least.
      *Done when:* manifest, `package.json` and the tag agree.
- [ ] **Write release notes that lead with the breaking parts**, because
      every one of them will otherwise arrive as "my hotkeys stopped
      working":
      1. site access is now granted per site — existing stacks need a grant
         before they fire again (`docs/chrome-store-submission.md`, "What
         changed for an existing install");
      2. "Copy element to clipboard" is gone; those steps become "Read
         element" on load;
      3. Fetch URL now only runs in a stack scoped to a site.

## Phase 1 — the things Google will not accept the listing without

- [ ] **Host the privacy policy and get a URL.** `docs/privacy-policy.md`
      exists but is not published anywhere; the Developer Dashboard requires
      a reachable URL. GitHub Pages off this repo is the zero-infrastructure
      option (open decision #1 in the submission checklist).
      *Done when:* the URL loads in a private window and is pasted into both
      the dashboard and `docs/store-listing.md`.
- [ ] **Finish the screenshots.** Two are ready and uploadable:
      `listing-1-builder-1280x800.png` (the clean primary frame) and
      `listing-2-site-only-fetch-1280x800.png` (the site-only fetch rule).
      Still needed: the action menu in a full window (the one taken is
      589×668 and the Store takes only 1280×800 or 640×400), and one frame
      of a popup firing on a real page — the only frame that shows Keystack
      working rather than being configured.
      *Done when:* every uploaded file is 1280×800, 24-bit, no alpha.
- [ ] **Fill the dashboard forms** from `docs/store-listing.md`: short
      description (91 chars, ready), detailed description, the three
      permission justifications, the single-purpose statement, and the data
      declarations (authentication information + website content, both
      "collected: yes, sold: no").
- [ ] **Certify Limited Use** and category (Productivity).

## Phase 2 — bugs and risks found while preparing this

- [ ] **A site with a port cannot be granted.** `permissionOrigin()` and
      `fetchOrigin()` both emit `*://localhost:8000/*`, and Chrome match
      patterns do not allow a port — `chrome.permissions.request()` rejects
      it outright. So a stack scoped to `localhost:8000` or a staging host
      on a non-default port can never be granted, and neither can a fetch to
      one. The fix is to drop the port when deriving the permission origin
      (`*://localhost/*` covers every port on that host) while Keystack's own
      matcher keeps matching the port as written.
      *Done when:* a site pattern with a port can be granted, and a test
      covers both derivations.
- [ ] **Verify the Import paste fix in a real browser.** The jsdom test
      pins the autofocus declaration, but jsdom has no modal dialog — only
      Chrome can confirm one ⌘V is now enough. If it is not, the cause is
      the options page running in an iframe inside `chrome://extensions`,
      which is not ours to fix.
- [ ] **Guard the bundled seed with the same scope rule.** `seedIfEmpty()`
      goes through `parseConfig`, not through the Save/Import check, so a
      future seed holding a fetch in a Common stack would be written to
      storage and then refused at run time. One check, one test.
- [ ] **Run the upgrade path on a real profile.** Load a profile that has
      the pre-change config, update the extension, and confirm: old stacks
      show "Not granted", granting one makes its hotkey work without a
      reload, a `copyBySelector` step became "Read element", and a Common
      stack with a fetch reports the scope error instead of calling.

## Phase 3 — worth having before the listing goes public

- [ ] **A local demo page to shoot and test against.** Screenshots currently
      need a real site; a page we serve ourselves is neutral, offline and
      stable (no third-party branding in the listing). Blocked by the port
      bug above unless it is served on port 80 or through a hosts entry.
- [ ] **A packaging step.** The upload wants a zip of `dist/`; there is no
      script for it, so it is a manual zip today and therefore a thing to
      get wrong at the worst moment.
- [ ] **CI.** `.github/` has a PR template and no workflows, while the repo
      has 448 tests and a typecheck worth running on every PR.
- [ ] **A LICENSE file.** `package.json` claims ISC and no license text
      ships.
- [ ] **Promotional tile** (440×280). Optional, but listings without one
      look unfinished in the Store's own surfaces.

## Phase 4 — after submitting

- [ ] Expect a review round on the permission justifications; the answers
      are already written, so it should be a paste rather than a rewrite.
- [ ] Decide whether `siteOnly` should also cover the two navigate actions.
      They open a URL rather than read a response, which is why they were
      left out — worth revisiting with a reviewer's eye rather than ours.

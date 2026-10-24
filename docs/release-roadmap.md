# Road to the Chrome Web Store

What is left between the code as it stands and a submitted listing, in the
order it has to happen. Each item says how to know it is done — a roadmap
whose items cannot be checked is a wish list.

Status as of 2026-10-24: the extension itself is submission-shaped (narrow
permissions, no clipboard, fetch and every selector-based action scoped to a
site, the rename to KeyRoutine done, a site pattern can no longer claim every
website, version reset to 0.1.0). The branch chain is merged to master and
pushed. What is missing is hosting, assets, and one real functionality gap
(Phase 5).

---

## Phase 0 — get the work onto master

- [x] ~~Merge the branch chain~~ — done. All six branches merged into
      `master` (`dc5cba0`) and pushed to `origin/master`. Verified the merge
      was clean before pushing: `origin/master`'s own two "ahead" commits
      were pure PR-merge wrappers with zero file diff against the shared
      ancestor, so nothing was lost or overwritten either direction.
- [x] ~~Decide the version~~ — reset to **0.1.0** in `manifest.json` and
      `package.json`, a deliberate restart rather than continuing 0.6.0 —
      nothing has ever actually shipped to the Store. Note: existing git
      tags (`v0.2.0`–`v0.2.2`) predate this and sort ahead of a future
      `v0.1.0` tag; harmless for the Store submission itself, just worth
      knowing if you tag this release.
- [ ] **Write release notes that lead with the breaking parts**, because
      every one of them will otherwise arrive as "my hotkeys stopped
      working":
      1. site access is now granted per site — existing routines need a grant
         before they fire again (`docs/chrome-store-submission.md`, "What
         changed for an existing install");
      2. "Copy element to clipboard" is gone; those steps become "Read
         element" on load;
      3. Fetch URL and every selector-based action now only run in a routine
         scoped to a site.
- [x] ~~Commit the toast/UX redesign~~ — done.
- [x] ~~Commit the site-only expansion + grant-row removal~~ — done
      (`44e417a`), now merged to master.
- [ ] **Commit the version bump.** `package.json` and `manifest.json` are
      uncommitted right now.

## Phase 1 — the things Google will not accept the listing without

- [x] ~~Host the privacy policy and get a URL.~~ Live:
      https://oo11o.github.io/keystack/privacy-policy/ — GitHub Pages
      enabled on `master` / `/docs`, serving
      `docs/privacy-policy/index.html`. Pasted into `docs/store-listing.md`.
      **Still needs a human:** paste it into the Developer Dashboard's own
      Privacy policy field — that part has no API this session can reach.
- [ ] **Retake every screenshot.** All of them show the old name: the
      header reads "Keystack" and the middle column "Stacks". The framing
      and the demo config are still right, so it is a re-shoot, not a
      redesign — `listing-1-builder-1280x800.png` and
      `listing-2-site-only-fetch-1280x800.png` are the two to reproduce.
      Still missing besides those: the action menu in a full window (the one
      taken is 589×668 and the Store takes only 1280×800 or 640×400), and
      one frame of a popup firing on a real page.
      *Done when:* every uploaded file says KeyRoutine and is 1280×800,
      24-bit, no alpha.
- [ ] **Fill the dashboard forms** from `docs/store-listing.md`: short
      description (91 chars, ready), detailed description, the three
      permission justifications, the single-purpose statement, and the data
      declarations (authentication information + website content, both
      "collected: yes, sold: no").
- [ ] **Certify Limited Use** and category (Productivity).

## Phase 2 — bugs and risks found while preparing this

- [x] ~~A site with a port cannot be granted.~~ Fixed — `permissionOrigin()`
      and `fetchOrigin()` now drop the port before building the origin
      (`*://localhost/*` instead of `*://localhost:8000/*`), since Chrome
      match patterns have no port syntax and the permission was host-wide
      regardless. `matchesPattern()` — what a routine actually runs
      through — still matches the port exactly, so a routine written for
      :8000 does not also fire on :9000. Three new tests cover both
      directions.
- [ ] **Verify the Import paste fix in a real browser.** The jsdom test
      pins the autofocus declaration, but jsdom has no modal dialog — only
      Chrome can confirm one ⌘V is now enough. If it is not, the cause is
      the options page running in an iframe inside `chrome://extensions`,
      which is not ours to fix.
- [ ] **Guard the bundled seed with the same scope rule.** `seedIfEmpty()`
      goes through `parseConfig`, not through the Save/Import check, so a
      future seed holding a fetch in a Common routine would be written to
      storage and then refused at run time. One check, one test.
- [ ] **Run the upgrade path on a real profile.** Load a profile that has
      the pre-change config, update the extension, and confirm: old routines
      show "Not granted", granting one makes its hotkey work without a
      reload, a `copyBySelector` step became "Read element", and a Common
      routine with a fetch reports the scope error instead of calling.

## Phase 3 — worth having before the listing goes public

- [ ] **A local demo page to shoot and test against.** Screenshots currently
      need a real site; a page we serve ourselves is neutral, offline and
      stable (no third-party branding in the listing). Blocked by the port
      bug above unless it is served on port 80 or through a hosts entry.
- [ ] **A packaging step.** The upload wants a zip of `dist/`; there is no
      script for it, so it is a manual zip today and therefore a thing to
      get wrong at the worst moment.
- [ ] **CI.** `.github/` has a PR template and no workflows, while the repo
      has 478 tests and a typecheck worth running on every PR.
- [ ] **A LICENSE file.** `package.json` claims ISC and no license text
      ships.
- [ ] **Promotional tile** (440×280). Optional, but listings without one
      look unfinished in the Store's own surfaces.

## Phase 4 — after submitting

- [ ] Expect a review round on the permission justifications; the answers
      are already written, so it should be a paste rather than a rewrite.
- [x] `siteOnly` now also covers every selector-based action (Read element,
      Set field value, Focus element, Click element, Press key), not just
      Fetch URL — a selector written for one page's markup means nothing, or
      means the wrong thing, on any other page a Common routine would also
      fire on. The two navigate actions (open URL in a new/current tab)
      stayed out: they don't depend on the current page's structure.

## Phase 5 — the grant row was removed, and nothing replaced it

- [ ] **Decide how Common and a Fetch URL step ever get access again.** The
      standalone "Grant access" row (site settings, Common, a Fetch URL
      step) is gone. A site pattern typed with the auto-request checkbox on
      still asks Chrome immediately — that part still works — but it is now
      the *only* path in the whole builder that can call
      `chrome.permissions.request()`. Common and every Fetch URL step have
      no UI left to ever grant them, and a site whose pattern was added with
      the checkbox off, or that existed before this session, has no way to
      ask again short of retyping the pattern.
      *Done when:* there is some way, anywhere in the builder, to grant
      Common and a Fetch URL step's host — even if it is not the row that
      was removed.

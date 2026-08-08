# 2026-08-08 — A peer looked up, not imported (roadmap 16.1)

## What got done

- **`bsToast`, `bsModal`, `bsLoadingOverlay`** on `egl-utils-js/bootstrap`
  (`bootstrap-behaviors.js`), and **`PeerMissingError`** (`EGL_PEER_MISSING`, with
  `.peer`) on `egl-utils-js/errors` — spec 04 F68–F71, fixed by
  [ADR-0041](../../../adr/0041-a-peer-looked-up-not-imported.md).
- 30 jsdom cases against a lifecycle-dispatching double, 4 real-engine cases against the
  actual Bootstrap bundle, and the NFR-18 pair in plain Node: the entry imports with no
  peer, and a wrapper's first use throws `EGL_PEER_MISSING`. `bootstrap-behaviors.js` is
  at 100% lines / 98.5% branches.
- Budgets pinned on measurement and two clauses amended by ADR (NFR-17): `bsModal` 1060 B
  (row 1.13 kB, inside the ≤ 1.25 kB wrapper clause), `bsToast` 2170 B (row 2.32 kB,
  reclassified as *composing*), `bsLoadingOverlay` 2550 B (row 2.73 kB, clause raised from
  1.75 kB), `/bootstrap` entry 15083 B (row 16.2 kB, clause 15 → 25 kB), `/errors` 351 B.

## Decisions taken

- **The peer is a value lookup, never an import** — not static (it would fail at load for
  a consumer who only wanted `bsBadge`) and not dynamic either (it would make every
  wrapper method asynchronous). The `/sanitize` precedent holds for a single-purpose
  entry; this entry has two halves and only one needs the package.
- **Resolution happens at the first operation, not at construction**, and is never
  negatively memoized: wiring a UI at startup is free, a packaging mistake surfaces at the
  call that needs the package, and a `<script>` that loads late still works.
- **F71 resolves the peer before engaging the F50 gate.** ADR-0032 makes the gate contain
  a failing presentation hook; a missing peer resolved inside `onShow` would be contained
  too, and the caller would see no overlay and no reason. Containment protects against a
  presentation that cannot render; a missing peer is a packaging mistake, and NFR-18
  promises those are typed and visible. Recorded as the single bounded exception.
- `getOrCreateInstance` over `new`, so a dialog Bootstrap's data-API already created is
  adopted rather than shadowed; `destroy()` on a shown modal hides first and disposes on
  `hidden.bs.modal`, since disposing a shown one strands the backdrop.

## Findings worth carrying forward

- **BUG-0003, filed not fixed** (ROADMAP 16.5). The new NFR-18 suite runs every builder in
  plain Node against a JSDOM document, and three composites throw there — `bsAlert`,
  `bsPagination`, `bsListGroup({onSelect})` each build an internal `AbortController` and
  hand its signal to a foreign realm's `addEventListener`, which refuses it. It breaks
  exactly the server-render path the `{document}` option exists for. Excluded **by name**
  in the test with a pointer to the record, and pinned as a known failure so the fix
  flips it.
- **Two test-shaped failures that were not library failures**, both worth remembering:
  `toBeFocused()` is a `:focus` check and WebKit does not match `:focus` while the window
  is unfocused, as it is under a headless runner — assert `document.activeElement`, which
  is what F50 actually promises; and anything owned by Bootstrap's fade (the backdrop
  leaving the DOM) is an *eventual* condition, so poll it rather than sampling the instant
  the gate reports hidden.
- **A speculative fix, tested and reverted.** A deferred `resolve()` in the transition
  helper looked like the cause of the WebKit focus failure; a probe showed focus restored
  correctly with and without it, so it came out again. The probe was the cheap step.
- **The browser fixture stays peer-free**: the bundle is injected per test, because the
  fixture also carries 14.1's proof that the entry works with no `bootstrap` global.
  Making a new test pass by loading Bootstrap for everybody would have deleted that proof.

## Where the project stands

M14 and M15 complete, **M16 one of four items in**. v0.7.0 is the released version;
**v0.8.0 has not been cut**, so the two 15.x changesets and this one will land in the same
minor unless the maintainer cuts M15's release first. ADRs through **0041, next free
0042**. Local Firefox still cannot launch (`spawn UNKNOWN`); Chromium and WebKit both run
the full suite green — 168 passed — and CI is the authority for Firefox.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. Then **16.2** on `feat/bootstrap-nav`: `bsCollapse`, `bsAccordion`, `bsDropdown`,
   `bsTabs`, `bsNavbar` (spec 04 F72–F76) — the F68 contract this PR set is the template
   they copy, so they should be mechanical; the ARIA surfaces are the work.
3. Open, and cheap to take in any order: 16.5 (BUG-0003), and the v0.8.0 release decision.

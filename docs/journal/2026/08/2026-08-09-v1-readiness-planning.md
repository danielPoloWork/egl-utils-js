# 2026-08-09 — Planning the road to 1.0 (M17)

## What got done

- **Milestone 17 — v1.0.0 readiness & the first stable release** planned in `ROADMAP.md`
  (17.1–17.5), README milestone row added, and the spec-01 coverage rows extended where
  M17 amends them (§3 for the runtime floor and the NFR-01 clause, §5 for the surface
  review).
- **No new spec.** M17 ships no functional surface, so specs 01–04 stand as they are and
  the two clauses M17 touches (NFR-01, NFR-07) are amended in the implementing PRs, the
  way every amendment in this project has been. The precedent is M8, which was also a
  milestone of follow-ups rather than a capability wave.

## The decision this milestone exists to serve

v0.9.0 shipped with **no open roadmap items, no open bugs, 110 exports across 10 entries
and every gate green**. So the 1.0 question is not readiness — it is what the version
number *commits to*: after 1.0, every export, every `EGL_*` code and every exports-map path
is MAJOR-protected. The surface went from 25 functions to 110 in a handful of milestones,
and "complete" is not the same as "settled".

The owner chose the review-first path over tagging 1.0 directly, and chose to spend the
major boundary on the two things that only a major boundary buys.

## What is in, and what is deliberately out

**In**, because a major is the only cheap moment for them:

- **17.1 the readiness review** — an audit for what we would regret freezing: shape
  consistency (some builders return an `Element`, others an instance), option and callback
  drift between sibling APIs, the exports-map shape. Findings become items, per the 7.6
  precedent. It proposes no features.
- **17.2 the runtime floor** — Node 18 left maintenance in April 2025 and Node 20 in April
  2026, so a 1.x born now carries unmaintained runtimes for years. Breaking by
  construction, which is exactly why it belongs before the freeze rather than after it.
- **17.4 the NFR-01 clause ADR-0015 left open** — practice has amended it four times
  (`httpClient`, `bsTable`, `tablePipeline`, `bindTableControls`). A 1.0 should ship the
  clause it actually enforces.

**In**, because a 110-export surface deserves it:

- **17.3 publishing the generated API reference.** `docs/api/` is built and gitignored, so
  today a consumer has the README and their editor's tooltips.

**Out**, deliberately: the `bsTable` extras already catalogued in spec 04's non-goals — CSV
export, sticky headers, column resize. They are additive, and additive work belongs in 1.x.
Holding a 1.0 for features is how a 1.0 never happens.

## Where the project stands

M1–M16 released; v0.9.0 tagged and its GitHub Release drafted (publishing is the owner's).
`.changeset/` empty, `[Unreleased]` empty. ADRs through 0045, next free 0046. M17 planned,
nothing started.

## How the next session resumes

1. Wait for this planning PR to merge (one item per PR).
2. Start **17.1**, the readiness review, on `review/v1.0.0-readiness`. Its output is a
   document under `docs/releases/` (the `v0.1.0-readiness-review.md` precedent) plus any
   findings filed as new M17 items in the same PR.
3. 17.2 is the one to think hardest about before writing anything: the floor decision
   governs `engines`, the CI matrix, `SUPPORT_MATRIX` in `tools/api-floor-inventory.js`,
   the Safari figure and spec 01 NFR-07 — and the api-floor gate is computed from it, so
   raising the floor may make previously-guarded APIs unguarded and *should* show up as
   inventory churn.

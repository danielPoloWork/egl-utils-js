# 2026-08-07 — The Bootstrap wave planned (spec 04, M14–M16)

## What got done

- Authored [`docs/specs/04_spec_bootstrap_toolkit.md`](../../../specs/04_spec_bootstrap_toolkit.md)
  — the frozen contract for the fourth wave (F52–F81, NFR-17–21): an opt-in
  `egl-utils-js/bootstrap` entry carrying one standalone manager for **every component
  in the Bootstrap 5 catalog (24/24)** plus `bsTable`, the table facade composing the
  spec-03 pipeline.
- Planned **Milestone 14 — Bootstrap element builders** (14.1–14.2), **Milestone 15 —
  Bootstrap table manager** (15.1–15.2) and **Milestone 16 — Bootstrap interactive
  wrappers** (16.1–16.4) in `ROADMAP.md`, with route annotations; added the spec-04
  coverage sub-table and the spec-03 completion note; README gained milestone rows
  14–16; the `bootstrap` commit scope is declared in AGENTS.md §6.3 and
  `docs/workflow/git-workflow.md` §3.

## Decisions frozen in spec 04

- **Layering**: `/bootstrap` composes the agnostic core (F42/F44/F49/F50/F51); the core
  never imports it. Compose, never reimplement.
- **Classes are data, behaviors are a peer**: builders (F52–F65) never touch Bootstrap
  JS — the zero-dependency promise holds; behavior wrappers (F68–F81) resolve the
  optional `bootstrap` peer **lazily, injected-first, global second**, and fail typed
  with the new stable code `EGL_PEER_MISSING` (the `/sanitize` ADR-0012 precedent,
  applied to a second package). `@popperjs/core` is named in F80/F81's failure, never
  declared or bundled.
- **Escape-by-default is the toolkit's security posture** (NFR-19): no builder ever
  concatenates caller data into markup; the only raw-HTML path is the explicit
  `{html: true, sanitize}` pair, adversarially corpus-tested on every content-accepting
  option.
- **Budgets follow the NFR-12 lesson from day one** (NFR-17): indicative ceilings, each
  row pinned to measured +≈7% on landing by ADR — `bsTable` pre-declared as a composing
  exception at ≤ 6.5 kB.
- **Accessibility is mechanical** (NFR-21): the documented ARIA surface per component is
  asserted in jsdom, and an icon-only control without an accessible name is a
  `TypeError`, not a warning.

## Where the project stands

Milestones 1–13 complete, specs 01–03 fully delivered, **v0.6.0 released and published
(Latest)**. Spec 04 and M14–M16 are planned (this PR); no wave implementation started.
ADR numbering: 0036 used, next free 0037. After M16 the catalog closes at 24/24 —
the natural point to open the v1.0.0 discussion (owner's call).

## How the next session resumes

1. Wait for this planning PR to merge (one PR at a time).
2. Start roadmap **14.1** on `feat/bootstrap-foundation`: `/bootstrap` entry wiring
   (package.json exports + optional `bootstrap` peer, tsup entry, typedoc entryPoints,
   size-limit rows), the F52 builder contract + atom builders with the escape corpus,
   the sets-pattern ADR (0037), threat-model row, README usage subsection, changeset
   (`minor`), journal checkpoint.
3. GitHub milestones `M14 — Bootstrap element builders`, `M15 — Bootstrap table
   manager`, `M16 — Bootstrap interactive wrappers` are created alongside this PR.

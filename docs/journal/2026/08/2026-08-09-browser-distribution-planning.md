# 2026-08-09 — Planning the browser distribution wave (spec 05, M18) and triaging one proposal

## What got done

- **ADR-0046** — the owner brought a 74-section concept document (an enterprise Bootstrap
  extension layer, written in Italian, so uncommittable under AGENTS.md §2) together with a
  stated objective: the library must work from a plain HTML page with no Node and no
  bundler. The ADR is the English disposition of all 74 sections — delivered / adopted /
  deferred / rejected, each with its rationale — and the durable record future wave
  planning cites.
- **Spec 05 — browser distribution** authored (F82–F87, NFR-22–NFR-24): the `/sanitize`
  no-bundler contract (mechanism-neutral, owned by the 17.6 ADR), the global single-file
  artifact (`window.egl`), CDN resolution fields, the no-bundler documentation, CI
  no-bundler smoke, and unbundled transfer accounting.
- **ROADMAP** — item **17.6** added to M17 (decide the `/sanitize` peer-resolution contract
  before 1.0 freezes it; today `/sanitize` static-imports `dompurify` while `/bootstrap`
  looks its peer up per ADR-0041 — two contradictory mechanisms, and the wrong one to
  freeze); **M18 — Browser distribution** planned (18.1–18.5, spec-05 coverage sub-table,
  runs after v1.0.0); **M19–M21 planned as provisional waves** by owner decision — table
  data & `bsTable` extras, application UX utilities, form engine — items numbered now,
  each wave's spec (06–08) still authored in its own planning PR before implementation,
  execution order among them the owner's post-1.0 call.
- **README** milestone rows 18–21; **patterns catalogue** gains *Rejected* row 5
  (Registry + auto-init scanning, per ADR-0046); GitHub milestones M18–M21 created.

## The finding that shaped the wave

Nine of the ten entries already load and run from `<script type="module">` with no bundler
— the Playwright suite proves that exact path in CI, three engines, static file server,
raw `/dist/esm/*.js`. The no-bundler story is not a port; it is one line of `/sanitize`
(`import ... from "dompurify"`, fatal at module load without an import map), one missing
artifact (no IIFE build exists), two missing package fields (`unpkg`/`jsdelivr`), a README
section that does not exist, and size accounting that measures bundler output only. That
is why M18 is five items rather than a rewrite — and why the only piece that cannot wait
for 1.x is the `/sanitize` *contract decision*, which 17.6 now owns.

One correction carried forward rather than backward: spec 04 §1 catalogues **four**
`bsTable` backlog items — *"CSV/Excel export, sticky headers, column resize and reorder"* —
and this journal's v1-readiness predecessor shorthanded them as three. Journals are
immutable; ADR-0046 and spec 05 quote the clause verbatim.

## Where the project stands

M1–M16 released; v0.9.0 current; `.changeset/` and `[Unreleased]` empty (this is a
docs-only planning PR, the #105 precedent). M17 planned and now six items (17.1–17.6),
nothing started. ADRs through 0046, next free 0047. F-numbers through F87 allocated, next
free F88 (spec 06's, when authored). Specs 06–08 deliberately **not** authored yet: M17 is
about to move their inputs (17.1 shape findings, 17.2 runtime floor, 17.4 budget clause),
and one-PR-at-a-time means authoring them now buys nothing but amendment churn.

## How the next session resumes

1. Wait for this planning PR to merge (one PR at a time).
2. Start **17.1**, the readiness review, on `review/v1.0.0-readiness` — M17 runs first,
   M18 waits behind v1.0.0, and 17.6 is part of M17's window because its outcome may be
   breaking for bundler consumers if decided later.
3. M19–M21 order is decided by the owner after v1.0.0; each wave opens with its own
   planning PR authoring its spec.
4. The concept document's disposition is complete in ADR-0046; the Italian source stays
   untracked in the owner's working tree by their choice.

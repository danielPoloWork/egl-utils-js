# 2026-08-05 — Utility wave planning (spec 02, M9–M10)

## What got done

- Authored [`docs/specs/02_spec_core_extensions.md`](../../../specs/02_spec_core_extensions.md)
  — the frozen contract for the second utility wave (F26–F41): `/text`, `/net`,
  `/table` query primitives, root diagnostics/web absorptions, `pageSessionId` on
  `/storage`, and the `/logging` subpath.
- Planned **Milestone 9 — Text, net & query utilities** (six items, 9.1–9.6) and
  **Milestone 10 — Structured logging** (10.1) in `ROADMAP.md`, with hand-written route
  annotations (`.eados-core/` routing tooling is not present in the working tree; routes
  stay advisory).
- Restructured the ROADMAP **Spec Coverage Map** into per-spec sub-tables
  (`### Spec 01`, `### Spec 02`) so every spec keeps its own §-rows under the single
  lint-checked section.
- README: added milestone rows 9–10 and fixed the stale M8 row (`⏳ planned` → `✅ done`
  — items 8.1/8.2 have been merged since).
- Declared the wave's commit scopes in `AGENTS.md` §6.3 and
  `docs/workflow/git-workflow.md` §3: `text` `net` `table` `logging` `dom`, plus
  retro-declaring `diagnostics` (already used in history by roadmap 5.6).

## Decisions taken

- **The root NFR-01 ceiling (6 kB) stays frozen.** Measured root full import is ~5.1 kB,
  so the wave lands on Node-safe subpaths; the root absorbs only `formatDuration`,
  `normalizeError`, and `createResource`.
- **Query primitives land early (M9) on the `/table` entry** so the filter-grammar and
  comparator contracts soak before the table pipeline (spec 03) composes them.
- **NFR-04 parity explicitly does not extend to spec-02 functions** — no new pinned
  baselines; correctness properties are the deliverable.
- Dependency injection is the wave's construction rule: locale, collator, operators,
  sink, format, clock, id, storage, and transport are options with neutral defaults.

## Where the project stands

Milestones 1–8 complete, v0.1.0 released. M9/M10 planned (this PR), no wave
implementation started. Specs 03 (DOM, UI components, table pipeline) and 04
(Bootstrap 5 toolkit — full 24-component catalog) follow as their own planning PRs
after M10 and M13 respectively.

## How the next session resumes

1. Wait for this planning PR to merge (one PR at a time).
2. Start roadmap **9.1** on `feat/text-helpers`: new `text.js` + subpath wiring
   (package.json exports, tsup entry, typedoc entryPoints, size-limit rows), tests +
   property suites, the subpath-family ADR (next free number: 0019), README usage
   subsection, changeset (`minor`), journal checkpoint.
3. GitHub milestones `M9 — Text, net & query utilities` and `M10 — Structured logging`
   are created alongside this PR; M1–M7 exist (M8 was never created — left as is).

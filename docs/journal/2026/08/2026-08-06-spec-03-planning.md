# 2026-08-06 — v0.3.0 shipped, and spec 03 planned (M11–M13)

## What got done

- **v0.3.0 released.** PR #75 merged, annotated tag `v0.3.0` pushed, and `release.yml`
  drafted the GitHub Release from `docs/releases/v0.3.0.md`. That closes **spec 02: F26–F41
  all delivered** across M9 (v0.2.0) and M10 (v0.3.0).
- Along the way, PR #73 retired the `brace-expansion` audit exception
  ([ADR-0026](../../../adr/0026-brace-expansion-override-replaces-the-audit-exception.md)):
  the supply-chain gate now runs with **zero exceptions**.
- Authored [`docs/specs/03_spec_dom_ui_table.md`](../../../specs/03_spec_dom_ui_table.md) —
  the frozen contract for the third wave (**F42–F51**): the `tablePipeline` on `/table`, the
  new browser-leaning `/dom` entry (helpers, components, and the pipeline binding), and
  `DomContractError`.
- Planned **M11 — DOM foundation** (11.1–11.3), **M12 — UI components** (12.1–12.2) and
  **M13 — Composable table pipeline** (13.1–13.2) in `ROADMAP.md`, with a spec-03 coverage
  sub-table and README milestone rows.

## Decisions taken (frozen in spec 03)

- **The purity boundary is the entry boundary.** State and derivation live in `/table` and
  never touch `document`; every listener, attribute write and measurement lives in `/dom`.
  `bindTableControls` is the only bridge and speaks to the pipeline solely through public
  commands and the `'change'` event — which is what lets the same pipeline instance derive
  page 1 during a server render and be adopted by the browser afterwards.
- **Filtering and sorting compose.** The defect this wave exists to prevent: filters and
  sort are independent inputs to one fixed derivation (source → filters AND → search OR →
  stable multi-key sort → paginate), so neither discards the other. A compound command is
  one transaction and exactly one `'change'`.
- **`/dom` fails fast, never silently.** Every export throws `DomContractError`
  (`EGL_DOM_CONTRACT`) when there is no DOM — not `ReferenceError`, not a no-op. Storage's
  silent fallback was right because degraded storage still has meaning (ADR-0010); degraded
  DOM manipulation has none.
- **`injectFragment`'s `sanitize` is required** — a sanitizer or the literal `false` to
  declare the source trusted. Omitting it throws. Passing the sanitizer as a *parameter* also
  keeps `/dom` free of the DOMPurify optional peer.
- **Components ship mechanism, not a design system.** Class maps and icon renderers are
  injected and the defaults are framework-free; the Bootstrap 5 toolkit is spec 04, built
  *on top of* this wave.
- **NFR-16 makes the api-floor gate honest for the DOM.** ADR-0017 promised deny-by-default,
  but `Element`, `HTMLElement`, `Event`, `CustomEvent` and `getComputedStyle` are not in the
  scanner's policed list today, so a use of them would pass silently. Extending that list is
  a deliverable of 11.1, verified by planting a member and observing the failure.
- **Components and composing facades are exempt from the 1 kB per-function clause by spec**
  (F42, F49, F50, F51), each taking a named measured row instead. Deciding this up front
  avoids relitigating a budget in every implementation PR.
- **NFR-13 is an absolute budget, not a parity claim** (≤ 50 ms for 10k rows × 3 filters ×
  2-key sort, plus O(1) repeated `view()` asserted by identity). The NFR-04 non-extension
  therefore continues: no new pinned baselines, and the nightly parity gate does not grow.

## Where the project stands

Specs 01 and 02 complete; milestones 1–10 done; v0.3.0 tagged with its Release **in draft**.
Spec 03 is planned but not started. **Nothing is published to npm yet** — the registry has
no `egl-utils-js` at all, so the `publish.yml` dispatch is outstanding for both v0.2.0 and
v0.3.0 (first publish needs `--access public`, ADR-0016).

## How the next session resumes

1. Wait for this planning PR to merge (one PR at a time).
2. Start roadmap **11.1** on `feat/dom-foundation`: the `/dom` entry's four-file wiring,
   `bindElements`, `DomContractError` in `errors.js`, and the `POLICED` extension in
   `tools/check-api-floor.mjs` with a BCD-verified inventory entry per DOM member used. It
   sets the fail-fast pattern every later `/dom` export copies, so it earns its own ADR —
   next free number is **0028**.
3. GitHub milestones `M11 — DOM foundation`, `M12 — UI components` and
   `M13 — Composable table pipeline` are created alongside this PR.
4. Two dependabot PRs (#64 `globals`, #65 `@playwright/test`) are still open and may want a
   lockfile refresh after #73 changed `pnpm-lock.yaml`.

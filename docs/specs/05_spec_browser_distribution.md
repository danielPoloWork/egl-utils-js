# Software Specification: Browser Distribution (JavaScript (ES2023))

> Fifth-wave contract for `egl-utils-js` (milestone M18). Frozen once accepted: diverging
> implementation updates this spec in the same PR or adds an ADR superseding the relevant
> section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41,
> [`03_spec_dom_ui_table.md`](03_spec_dom_ui_table.md) owns F42–F51,
> [`04_spec_bootstrap_toolkit.md`](04_spec_bootstrap_toolkit.md) owns F52–F81): this
> document owns **F82–F87** and **NFR-22–NFR-24**.

## 1. Objective & Business Context

Every wave so far ships for the npm consumer: install, import, let a bundler resolve the
graph. A second consumer has been paying an undocumented tax the whole time — the **plain
HTML page**: an intranet tool, a server-rendered application with a `<script>` tag, a
CodePen reproduction, a page that adds one table to an existing site. That consumer has no
`package.json`, no bundler, and no Node; what they have is a static file server or a CDN
URL. The owner has named this consumer explicitly: the library must work by *loading* it,
not by *building* it.

The distance is smaller than it looks, because the browser artifact is already honest:
nine of the ten entries load and run today from `<script type="module">` against
`dist/esm/*.js` — the Playwright suite proves exactly that path in CI, on three engines,
from a bare static file server with no bundler involved. The gaps are enumerable, and this
wave is their closure:

- **`/sanitize` is the tenth entry.** `dist/esm/sanitize.js` opens with a bare
  `import ... from "dompurify"`, which a browser cannot resolve without an import map: the
  module dies at load, before any typed error can speak. The sibling peer is handled the
  opposite way — `/bootstrap` *looks up* `globalThis.bootstrap` at first use and throws
  `EGL_PEER_MISSING` when absent (ADR-0041). Two optional peers, two contradictory
  contracts; the contract decision is **ROADMAP 17.6** (pre-1.0, because freezing the
  static import and then changing it would break bundler consumers post-1.0), and F82
  states the outcome this wave must deliver under whichever mechanism that ADR picks.
  - **Resolved (roadmap 17.6, [ADR-0055](../adr/0055-the-sanitizer-s-peer-is-looked-up.md)):**
    the mechanism is the ADR-0041 lookup — `options.dompurify`, then `globalThis.DOMPurify`,
    then `EGL_PEER_MISSING` naming `dompurify`. `/sanitize` now carries **no bare specifier**,
    so the load half of F82 already holds and the browser fixture's import map is deleted.
    What 18.1 still owns is the **proof**: the same behaviour asserted on three engines from a
    static server, per F86.
- **No single-file artifact.** A classic `<script src>` page — no modules at all — has
  nothing to load: the build emits `esm` and `cjs` only.
- **The bare CDN URL resolves to nothing.** `package.json` names no `unpkg`/`jsdelivr`
  target, so only deep `/dist/esm/...` paths work, and nothing documents them.
- **Nothing is documented.** The README's only consumption model is the npm import; the
  no-bundler path exists in CI fixtures and nowhere a consumer looks.
- **Nothing is measured.** All 98 size rows model post-tree-shaking bundler output; the
  bytes a static page actually transfers (an entry plus its chunk waterfall, or the global
  artifact) are gated nowhere.

**Scope boundaries (deliberate non-goals of this wave):** bundling any peer into any
artifact (`bootstrap` and `dompurify` stay external and optional — the page loads them from
its own `<script>` tags exactly as Bootstrap's own documentation shows); UMD/AMD module
formats (one global IIFE artifact serves the no-module page; ESM serves everything else);
polyfills or a lowered platform floor (NFR-24); import-map generation tooling; and the
`bsTable` extras catalogued in spec 04 §1 — *"CSV/Excel export, sticky headers, column
resize and reorder"* — which stay backlog. The candidate feature waves identified by the
same triage that admitted this wave (table data & extras; application UX; form engine) are
recorded in [ADR-0046](../adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)
and planned as provisional milestones M19–M21, each owing its own spec before
implementation.

## 2. Functional Requirements

- F82 `/sanitize` no-bundler contract (mechanism owned by the 17.6 ADR; this clause is
  deliberately mechanism-neutral and states observable outcomes only): the `/sanitize`
  entry **loads** in a browser with no bundler and no import map; with the DOMPurify peer
  reachable (per the 17.6 contract — injected, ambient, or otherwise) `sanitizeHtml`
  works; with the peer absent, the failure is the typed `EGL_PEER_MISSING` error naming
  `dompurify` at the call that needed it — never a module-resolution failure at load, and
  never a silent no-op. Bundler consumers keep a working `/sanitize` with no new
  configuration (NFR-23).
- F83 Global single-file artifact: the npm package ships one additional browser artifact —
  a minified IIFE with a sourcemap — loadable via classic `<script src>` (no `type="module"`),
  exposing **one global namespace `egl`**: the root entry's exports at the top level
  (`egl.retry`, `egl.VERSION`, …) and each subpath as a named sub-namespace (`egl.text`,
  `egl.net`, `egl.table`, `egl.dom`, `egl.storage`, `egl.sanitize`, `egl.logging`,
  `egl.errors`, `egl.bootstrap`) — the full public surface, nothing renamed. Loading the
  artifact has no side effects beyond defining `egl`; peers stay external and are resolved
  at use exactly as on the ESM path (F68 lookup; F82 contract), so the artifact depends on
  F82's mechanism landing first. The artifact is version-locked by construction
  (`egl.VERSION` equals `package.json`, the existing F24/ADR-0018 lockstep).
- F84 CDN entry resolution: the package declares its CDN default — the `unpkg` and
  `jsdelivr` fields point at the F83 artifact, so the bare package URL
  (`https://cdn.jsdelivr.net/npm/egl-utils-js`) serves something that works in a
  `<script src>` — while the `exports` map is byte-for-byte untouched and every packaging
  gate (`publint --strict`, `attw`, `agadoo`, the no-runtime-deps assertion) stays green
  (NFR-23). Deep ESM paths (`/dist/esm/<entry>.js`) remain the documented module-consumer
  route.
- F85 No-bundler documentation: a README section ("Use from a browser, without npm")
  documenting, with copy-pasteable version-pinned URLs: the deep ESM route per entry; the
  F83 global artifact route; how each optional peer is supplied on each route (a Bootstrap
  bundle `<script>` satisfies `/bootstrap` with zero configuration; DOMPurify per the 17.6
  contract); and the cross-version rule — **all `egl-utils-js` URLs on one page pin the
  same version**, because entries share content-hashed chunks and mixing versions
  double-loads shared code. Every documented snippet corresponds to a load path F86
  exercises in CI.
- F86 CI no-bundler smoke: the Playwright matrix (three engines) loads the package **as
  the documentation says to** — the deep-ESM route with no import map for the library's
  own graph, and the F83 artifact via classic `<script src>` — asserting per route: the
  namespace/entry is reachable, `VERSION` matches, a builder renders, a peer-backed
  behavior works when its peer is loaded from a script tag, and peer absence surfaces as
  `EGL_PEER_MISSING` (F82/F68), not as a load failure.
- F87 Unbundled transfer accounting: every documented no-bundler path has a **measured,
  gated byte figure**: per entry, the entry file plus its transitively imported chunks
  (the real request waterfall a static page pays); plus the F83 artifact under its NFR-22
  budget. Figures live in the size gate beside the existing 98 rows, in the same
  min+gzip metric, so a regression in what a browser downloads fails CI like any other
  budget.

## 3. Non-Functional Requirements

- NFR-22 **Artifact budget (hard):** the F83 global artifact is **≤ 40 kB min+gzip** at
  authoring time — the ceiling derived from the sum of today's ten measured entry figures
  (≈ 39.8 kB), which double-counts shared chunks and is therefore an upper bound on a
  deduplicated single file. When 18.2 lands, the budget is re-pinned to **measured + ≤ 7%**
  (the ADR-0015 practice), and the pinned number amends this clause in that PR. Measured by
  the existing size-limit tooling (§6).
  - **Re-derived (roadmap 20.5, [ADR-0070](../adr/0070-two-primitives-extracted-and-a-ceiling-recomputed.md)),
    under spec 07 NFR-33:** the ceiling is **≤ 52 kB**, and the number comes from redoing the
    derivation above rather than from needing a bigger one. The same method — the sum of the
    measured entry figures, which double-counts shared chunks and is therefore an upper bound
    on a deduplicated single file — reads **52 104 B** today against ≈ 39.8 kB at M18: `root`
    6 103, `/storage` 2 104, `/sanitize` 1 491, `/text` 924, `/net` 770, `/table` 6 861,
    `/logging` 1 475, `/dom` 7 481, `/bootstrap` 24 518, `/errors` 377. Two waves of surface
    (M19's F88–F100, M20's F109–F110 so far) are the whole of the difference.
    - **The clause is an authoring bound, not the gate.** The artifact measures **39 696 B
      served**, 12 kB under the recomputed ceiling — that gap *is* the deduplication the
      derivation always assumed, and a clause with slack in it does no per-PR work. What
      gates growth is the **size-limit row, pinned at measured + ≤ 2%**, which is the split
      [ADR-0041](../adr/0041-a-peer-looked-up-not-imported.md) already made explicit for the
      `/bootstrap` entry: a clause sized for the finished thing, a row sized for this PR, two
      instruments doing different jobs.
    - Recomputing rather than raising is the condition spec 07 NFR-33 attached, and it is the
      reason this is written down with its arithmetic instead of as a number.
  - **Amended (roadmap 18.2, [ADR-0059](../adr/0059-one-file-one-global-and-a-budget-repinned.md)):**
    the artifact measures **31 444 B** and the budget is pinned to **33.6 kB** — measured
    **+ 6.9%**, inside the ≤ 7% this clause reserved. Two notes on the metric, because the
    derivation above and the tooling it names do not use the same one. The size-limit rows
    this project has gated since M7 measure **brotli**, so 31 444 B is the brotli figure and
    33.6 kB is a brotli budget; the same file is **35 842 B gzipped**. Both are inside the
    40 kB authoring ceiling, and the ceiling's own ≈ 39.8 kB derivation was itself a sum of
    brotli entry rows — so the comparison the clause intended is the brotli one, and the
    wording "min+gzip" was loose rather than the numbers being wrong. The deduplication the
    derivation predicted is visible, and larger than predicted: the ten entry rows now sum to
    **41 847 B** (the ≈ 39.8 kB above was the figure when this wave was planned, before the
    M17 items moved several entries), and the single file is **25% under** that sum.
  - **Re-derived again (roadmap 20.1, [ADR-0071](../adr/0071-a-manager-not-three-globals-and-a-dismissal-is-an-answer.md)),
    under spec 07 NFR-33:** the ceiling is **≤ 57 kB**. The derivation has an **eleventh
    input** — the new `egl-utils-js/ui` entry spec 07 NFR-32 required — and the same method
    reads **57 278 B**: `root` 6 103, `/storage` 2 104, `/sanitize` 1 491, `/text` 924,
    `/net` 770, `/table` 6 861, `/logging` 1 475, `/dom` 7 483, `/bootstrap` 24 527,
    `/errors` 377, `/ui` 5 163. The new entry is 5 163 B of it; the remaining 11 B is
    `/dom` and `/bootstrap` moving by 2 B and 9 B as esbuild re-split the shared chunks
    around an eleventh consumer of them — measured, not assumed, and the reason the sum is
    recomputed from the build rather than added to on paper.
    - **The gate is still the row, not the clause.** The artifact measures **41 063 B
      served** against the recomputed 57 kB, so the slack widened rather than closed; the
      size-limit row is re-pinned to **42 kB**, measured + 2.1%, holding ADR-0059's rule
      that the tight row does the per-PR work.

- NFR-23 **Bundler-consumer non-regression (hard):** the `exports` map's shape and
  resolution semantics are untouched by this wave; `sideEffects: false` continues to hold
  for every module including the new artifact's source; runtime dependencies stay **zero**
  (`tools/assert-no-runtime-deps.mjs` unchanged); `publint --strict`, `attw --profile
  node16`, and `agadoo` stay green. A bundler consumer upgrading across this wave changes
  **nothing** and re-bundles to the same graph.
- NFR-24 **Platform floor unchanged (hard):** this wave adds **no new platform APIs** —
  the deny-by-default api-floor inventory (`tools/api-floor-inventory.js`, ADR-0017) gains
  no entries on its account, and the browserslist floor does not move. (Deliberate
  contrast: the deferred M20 wave needs floor amendments — `matchMedia` at minimum — which
  is part of why it is a separate, spec-gated wave.)

## 4. Logical Architecture & Core Algorithm

One package, three consumption routes, one resolution rule for peers:

```text
                        npm package  (files: dist/**)
     ┌────────────────────────┬──────────────────────────┬─────────────────────┐
 dist/esm/<entry>.js      dist/cjs/<entry>.cjs      dist/global/egl-utils.global.js
 + relative chunk-*.js    (self-contained)          (one file, IIFE, sourcemap)
     │                        │                          │
 bundler import          require()                  <script src>  ← unpkg/jsdelivr
 <script type="module">                              window.egl.{...}
 deep CDN URL                                        egl.dom, egl.bootstrap, …
     └────────────────────────┴──────────────────────────┘
                               │
              peers, both routes, one rule (F68 / 17.6 ADR):
              injected option → ambient global → typed EGL_PEER_MISSING
              (never a bare import in a browser artifact)
```

The global artifact is an *aggregation*, not a fork: its source is a thin aggregator module
that re-exports the ten public entries under their namespace names, so the IIFE build
inherits every contract (escaping, teardown, typed errors) from the same modules the ESM
build ships. There is no artifact-specific behavior to test — only artifact-specific
*loading*, which is exactly what F86 exercises.

## 5. Public Interface

New, SemVer-protected once shipped:

- The global namespace **`egl`** (F83): top level = the root entry's 35 exports; one
  sub-namespace per subpath entry, named after the subpath (`egl.text`, `egl.net`,
  `egl.table`, `egl.dom`, `egl.storage`, `egl.sanitize`, `egl.logging`, `egl.errors`,
  `egl.bootstrap`). Names inside are identical to the ESM exports — the artifact
  introduces a namespace, never a rename.
- The artifact path inside the package: `dist/global/egl-utils.global.js` (+ `.map`),
  the target of the new `unpkg`/`jsdelivr` package fields (F84).
- The `/sanitize` no-bundler behavior per F82, with its error model: peer absence is
  `EGL_PEER_MISSING` with `.peer === 'dompurify'` at the first call that needs the peer —
  the same taxonomy and timing `/bootstrap` already commits to (F68).

Unchanged and explicitly protected (NFR-23): the `exports` map, every existing entry's
surface, and the error taxonomy.

## 6. Verification & Test Strategy

- **F82** — the browser fixture drops the import map for the library's own graph; a smoke
  case loads `/sanitize` raw, asserts the module evaluates, asserts `sanitizeHtml` works
  with the peer supplied per the 17.6 contract, and asserts `error.code ===
  'EGL_PEER_MISSING'` with `.peer === 'dompurify'` when it is not. The bundler path is
  covered by the existing unit suite continuing to pass unmodified (NFR-23).
- **F83** — a Playwright case loads the artifact via classic `<script src>` in all three
  engines and asserts: `window.egl` exists, `egl.VERSION` equals `package.json` (the
  ADR-0018 lockstep, asserted on the artifact), a `bsBadge` renders, a peer-backed call
  with Bootstrap's bundle loaded works, and the same call without it throws the typed
  error. No-side-effects is asserted by diffing the page's globals before/after load
  (exactly one new binding: `egl`).
- **F84** — a packaging test asserts the `unpkg`/`jsdelivr` fields name a file present in
  the packed tarball (`files` array); `publint --strict` and `attw` remain in
  `check:package` and must stay green.
- **F85** — the documentation rule is structural: every README no-bundler snippet names a
  URL shape that an F86 fixture loads; the journal for 18.4 records the
  snippet-to-fixture correspondence so a reviewer can check it mechanically.
- **F86** — the smoke cases above run in the existing `test:browser` CI job (three
  engines), against the built `dist/`, served by the same static server — no bundler in
  the loop, which is the point.
- **F87 / NFR-22** — size-limit rows: one per documented deep-ESM entry route measuring
  the entry file plus its chunk imports as served bytes, and one for
  `dist/global/egl-utils.global.js` with the NFR-22 budget. The rows live in
  `.size-limit.json` beside the existing 98 and fail CI on regression like any other.
  - **Amended (roadmap 18.5, [ADR-0061](../adr/0061-served-bytes-are-their-own-accounting.md)):**
    the served-bytes rows live in **their own gate** — `tools/transfer-budgets.js` declares
    them, `tools/check-transfer-budgets.mjs` verifies them inside `check:package` — not in
    `.size-limit.json`. Two reasons, the first mechanical: a deep-ESM route is a set of
    **content-hashed** chunk files, and appending one comment line to `errors.js` renames
    four of the nine (measured, then reverted), so a static row naming a chunk would need
    re-editing on most PRs that touch any source. The gate is keyed by **entry name** —
    stable public API — and resolves the closure at run time. Second, a size-limit row
    measures the *bundled, tree-shaken* output a bundler consumer ships, which is a
    different and much smaller number than the served waterfall (`/index`: 6 068 B bundled,
    **13 461 B** served); both accountings are kept because they answer different questions
    for different consumers. The artifact keeps the NFR-22 budget ADR-0059 pinned and is
    additionally measured here as a one-request route.
- **NFR-23** — `pnpm check:package` (publint, attw, size, agadoo, no-runtime-deps)
  unchanged and green; the `exports` map is asserted untouched by the packaging test.
- **NFR-24** — `pnpm check:api-floor` passes with an unchanged inventory; the PR diff for
  every M18 item shows no `tools/api-floor-inventory.js` change.

# ADR-0059: One file, one global — composed by re-export, and a budget re-pinned

- **Status:** Accepted
- **Date:** 2026-08-19
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** [spec 05](../specs/05_spec_browser_distribution.md) §2 F83 and §3 NFR-22
  (amended here) / NFR-23, ROADMAP 18.2 (and 18.3–18.5, which build on this artifact),
  [ADR-0046](0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md) (the wave),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) and
  [ADR-0055](0055-the-sanitizer-s-peer-is-looked-up.md) (the peer lookups that make a
  peer-free artifact possible at all), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)
  (measure, then pin the budget with a named row),
  [ADR-0018](0018-version-on-the-root-surface.md) (the `VERSION` lockstep),
  [ADR-0002](0002-adopt-cross-language-source-layout.md) (where the new source file lives)

## Context

Spec 05 F83 asks for one additional artifact: a minified IIFE, loadable by a classic
`<script src>`, exposing the whole public surface as the single global `egl` — the root
entry's exports at the top level and each subpath as a sub-namespace. Everything about that
sentence is settled except *how the namespace comes to exist*, and three questions have to
be answered before any of the rest of the wave (18.3's CDN fields, 18.4's documentation,
18.5's smoke) has something to point at.

**How is a 113-binding namespace composed without rotting?** The obvious shape is an object
literal — `{ retry, delay, …, text, net }` — and it is correct exactly once. The next export
added to any entry is missing from the artifact, the omission is silent, and the only thing
that would catch it is someone remembering. This library has 110+ exports across ten entries
and adds more every wave.

**What performs the assignment to the global?** Something must write `egl` onto the page's
global scope, and the package claims `sideEffects: false` for every module it ships
(NFR-23). A source module that assigns to `globalThis` would make that claim false, and a
bundler that believed the claim could legitimately drop the assignment.

**A budget written before the thing existed.** NFR-22 set ≤ 40 kB as an *authoring* ceiling
derived from summing the ten entry rows — an upper bound on a deduplicated single file,
deliberately generous — and reserved the re-pin to measured + ≤ 7% for this item.

## Decision

**1. The namespace is composed by `export *`, in a source module that is not an entry
point.** `src/main/javascript/it/d4np/utils/global.js` does `export * from './index.js'`
plus one `export * as <subpath>` per entry, and nothing else. It is absent from the
`exports` map, so it is not importable by a consumer and adds nothing to the public surface;
it exists so the build has one place to bundle from. An export added to any entry appears in
the artifact by construction, with no list to update.

**2. The bundler performs the assignment, not the source.** `globalName: 'egl'` in
`tsup.config.js` emits the `var egl = (() => …)()` wrapper. No module in `src/` writes to a
global, `sideEffects: false` stays true, and loading the artifact does nothing beyond
defining `egl` — which is F83's own clause, now a property of the build rather than a
promise in prose.

**3. The artifact is a third build config, not a third format on the existing pair.** It
shares almost nothing with them: one source instead of ten entries, minified where they are
not, no declarations (a `<script>` consumer has no type resolution to satisfy, and the ten
entries already ship `.d.ts` for the consumer who does), `platform: 'browser'` instead of
neutral, and `clean: false` because it writes `dist/global/` while the pair owns
`dist/esm/` and `dist/cjs/`.

**4. The claims F83 makes are a gate, not a comment.** `tools/assert-global-artifact.mjs`
runs in `check:package` and asserts against the *built file*: that it defines exactly one
global and that global is `egl`; that every export of all ten entries is reachable at the
right place; that no sub-namespace name collides with a root export; that no peer specifier
survived bundling; that it is minified and references its sourcemap; and that `egl.VERSION`
equals `package.json` (ADR-0018's lockstep, extended to the artifact). The collision check
matters more than it looks: a subpath named like a root export would shadow one of the two
**silently**, and `export *` gives no error for it.

**5. NFR-22 is re-pinned to 33.6 kB — measured 31 444 B + 6.9%** — and the clause is amended
in this PR with the metric stated plainly. The size-limit rows this project has gated since
M7 measure **brotli**; NFR-22's prose says "min+gzip". Both readings clear the ceiling (the
same file is 35 842 B gzipped), and the ≈ 39.8 kB derivation was itself a sum of brotli
rows, so the intended comparison was always the brotli one and the wording was loose rather
than the numbers wrong. Saying so is cheaper than leaving a clause whose units disagree with
its own gate.

## Alternatives Considered

- **A hand-written namespace object**, listing the surface explicitly. Rejected for the
  reason in Context: it is a list that must be maintained in lockstep with ten entries, and
  its failure mode is a silent omission. The one thing it buys — an explicit, reviewable
  surface — is bought better by the gate, which compares the artifact against the entries
  themselves rather than against a second list that can also be wrong.
- **Sub-namespaces only, with no flattened root** (`egl.core.retry`). More uniform, and it
  makes the collision question disappear. Rejected: F83 specifies the flattened root, and it
  is the right call for the consumer this wave exists for — a page that wants `retry` should
  not have to learn that the root entry is called `core`. The collision risk is handled by a
  gate instead of by a naming layer nobody asked for.
- **A UMD build** instead of an IIFE, so the file also works under AMD/CommonJS loaders.
  Rejected: spec 05 §1 names UMD/AMD a deliberate non-goal — one global IIFE serves the
  no-module page and ESM serves everything else, and a UMD wrapper adds a format with no
  consumer in evidence.
- **Bundling the optional peers into the artifact** so a single `<script>` is
  self-sufficient. Rejected, and it is the one alternative that would be actively harmful:
  it would ship a second copy of Bootstrap or DOMPurify onto pages that already load them,
  and it would freeze a peer version inside our artifact — the opposite of the lookup
  contracts ADR-0041 and ADR-0055 just settled. Peers stay external and are resolved at use,
  exactly as on the ESM path.
- **Publishing the artifact under a new `exports` path** (`egl-utils-js/global`). Deferred,
  not rejected: NFR-23 freezes the exports map's shape for this wave, and a classic
  `<script src>` resolves a *file path*, not an export condition — so the path buys nothing
  until someone wants to `import` the bundle, which is the shape the ten entries already
  serve better. 18.3 gives the file its CDN address via `unpkg`/`jsdelivr` instead.

## Consequences

- **The npm package grows by one artifact and its sourcemap.** `files` already lists `dist`,
  so `dist/global/` ships with no packaging change — and the exports map, `sideEffects`,
  runtime dependencies, `publint`, `attw` and `agadoo` are all untouched, which is NFR-23's
  requirement met by construction rather than by care.
- **A new gate runs on every `check:package`.** It evaluates the built artifact in a `vm`
  context with a jsdom window, so "defines exactly one global" is measured — the context's
  own property names are diffed across the load — rather than asserted.
- **The artifact is 25% under the sum of its parts** (31 444 B against 41 847 B for the ten
  entry rows), which is the deduplication NFR-22's derivation predicted, larger than
  predicted, and the reason the generous authoring ceiling was never in danger.
- **The rest of the wave now has a target.** 18.3's `unpkg`/`jsdelivr` fields name this file,
  18.4 documents loading it, and 18.5 exercises it through a classic `<script src>` on three
  engines — the route this ADR deliberately does *not* claim to have proved, because a gate
  that evaluates the file in jsdom is not a browser.
- **Cost, stated:** a consumer who loads the artifact downloads the whole surface, including
  the ~20 kB Bootstrap toolkit they may not use. That is inherent to a single-file build and
  is exactly the trade the deep-ESM route exists to avoid; 18.4 documents both so the choice
  is the consumer's.

## References

- [spec 05](../specs/05_spec_browser_distribution.md) F83, NFR-22 (amended), NFR-23;
  ROADMAP 18.2.
- [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure, then pin),
  [ADR-0018](0018-version-on-the-root-surface.md),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md),
  [ADR-0055](0055-the-sanitizer-s-peer-is-looked-up.md).

# 2026-08-19 — One file, one global (18.2)

## What got done

- **`src/main/javascript/it/d4np/utils/global.js`** — the artifact's source, and nothing
  else: `export * from './index.js'` plus one `export * as <subpath>` per entry. Not an
  entry point, absent from the `exports` map, importable by nobody.
- **A third tsup config** emitting `dist/global/egl-utils.global.js` — minified IIFE +
  sourcemap, `globalName: 'egl'`, `platform: 'browser'`, no declarations, `clean: false`.
- **`tools/assert-global-artifact.mjs`** — a packaging gate that asserts every F83 claim
  against the *built file*, wired into `check:package` as `check:global`.
- **NFR-22 re-pinned**: measured **31 444 B**, budget **33.6 kB** (+6.9%), the clause
  amended in spec 05 with the figure and with the metric its own gate actually uses.
- ADR-0059, changeset (minor), CHANGELOG `[Unreleased]`, ROADMAP 18.2 checked, spec 05
  §3/§4 coverage glyphs advanced.

## The two decisions worth the ADR

**How a 113-binding namespace avoids rotting.** The obvious shape is an object literal, and
it is correct exactly once: the next export added to any entry is missing from the artifact,
silently, and only someone remembering would catch it. `export *` cannot drift by omission.
What it *can* do is drift by construction — a sub-namespace name that starts colliding with
a root export would shadow one of the two with no error at all — so that specific hazard is
a gate rather than a comment.

**What performs the assignment.** Something must write `egl` onto the page's global scope,
and the package claims `sideEffects: false` for everything it ships (NFR-23). A source
module doing `globalThis.egl = …` would make that claim false, and a bundler that believed
the claim could legitimately drop the assignment. So the assignment is tsup's `globalName`
wrapper, and "loading the artifact has no side effect beyond defining `egl`" becomes a
property of the build rather than a sentence in a spec.

## The gate, and proving it is not vacuous

`check:global` asserts: exactly one global is defined and it is `egl`; all ten entries'
exports are reachable at the right place; no sub-namespace collides with a root export; no
peer specifier survived bundling; the file is minified and references its sourcemap; and
`egl.VERSION` equals `package.json`. It evaluates the artifact in a `vm` context furnished
with a jsdom window and **diffs the context's own property names across the load**, so "one
global" is measured rather than asserted.

A gate that cannot fail is worse than no gate, so each branch was provoked: appending
`var eglExtra=1` produced *"must define exactly `egl`, it defined: egl, eglExtra"*; renaming
one export produced *"root exports missing from `egl`: validateEmail"*; stripping the
sourcemap comment produced *"does not reference its sourcemap"*. All three named the
specific fault.

The minification check took two attempts, which is worth recording: the first asserted the
first line exceeded 50 000 characters, on the assumption that minified output is one line.
esbuild emits a handful of very long lines (4 lines averaging 28 579 chars here), so the
real artifact failed its own gate. The check now uses average line length, which is what the
property actually is.

## The budget, and a metric that did not match its clause

Measured **31 444 B**, pinned to **33.6 kB** — +6.9%, inside the ≤ 7% NFR-22 reserved.

Two things the numbers said that the clause did not. First, **the metric**: every size row
this project has gated since M7 measures **brotli**, while NFR-22's prose says "min+gzip".
Both readings clear the 40 kB ceiling (the same file is 35 842 B gzipped) and the ceiling's
own ≈ 39.8 kB derivation was itself a sum of brotli rows — so the intended comparison was
always brotli and the wording was loose rather than the numbers wrong. Amending the clause
to say so is cheaper than leaving units that disagree with their own gate.

Second, **the derivation drifted**: the ten entry rows now sum to **41 847 B**, not the
≈ 39.8 kB written when the wave was planned — the M17 items moved several entries. Against
today's sum the single file is **25% under**, which is the deduplication the ceiling was
generous to allow for.

## Verification

`check:package` green end to end — build, publint --strict, attw node16, **100 size rows**,
agadoo, zero-deps, and the new F83 gate. Lint, format, api-floor and the consistency lint
clean. Browser suite green on chromium after the build change.

**Local flakiness, attributed rather than waved away.** The browser suite failed 1–6 tests
per run on this Windows host — always the same shape: `page.goto` to the *shared* fixture
timing out or aborting inside a `beforeEach`, in the mXSS corpus block, which is where
Playwright's parallel workers hit the hand-rolled static server hardest. Before blaming or
excusing the change, the suite was run on the **stashed (unmodified) tree**: it failed
**4 tests the same way**. So the flakiness is pre-existing and host-specific, not 18.2's —
and CI, which runs the same suite on Linux, was green for 18.1 immediately before this.
The corpus block alone passes 46/46; only the full-suite parallel load provokes it.

One `pnpm coverage` run also reported **1 failed / 2415** with the output uncaptured; three
subsequent runs were **2415/2415**. Same host, same conclusion, and no library source
changed in this PR — the one new module is re-export-only and no test imports it.

## Where the project stands

v1.0.0 released. M18 in progress: 18.1 and 18.2 done, 18.3–18.5 open. ADRs through 0059,
next free 0060. `.changeset/` holds one minor. Five Dependabot PRs open and untouched.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **18.3** — the CDN fields (`unpkg`/`jsdelivr` naming this artifact) plus a packaging test
   that the fields point at files actually present in the packed tarball. Note NFR-23: the
   `exports` map must stay byte-identical, so the CDN fields are top-level keys beside it,
   never new export conditions.
3. 18.4 documents both routes and 18.5 loads the artifact through a real `<script src>` on
   three engines — the one F83 claim ADR-0059 deliberately does **not** make, because a gate
   that evaluates the file in jsdom is not a browser.

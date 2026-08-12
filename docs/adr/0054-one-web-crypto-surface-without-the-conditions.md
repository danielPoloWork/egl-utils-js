# ADR-0054: One Web Crypto surface, without the conditions — and two builds instead of four

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Supersedes:** [ADR-0008](0008-one-webcrypto-surface-conditional-exports.md)
- **Related:** ROADMAP 17.14 (filed by 17.2), [ADR-0050](0050-the-1x-runtime-floor.md) (the
  floor that made this possible), [ADR-0017](0017-platform-api-floor-gate.md) (the inventory
  entry this rewords), spec 01 §3 NFR-07 (amended here), spec 05 NFR-23 (the exports-map
  freeze this lands before)

## Context

ADR-0008 solved a real problem with the machinery the problem needed. Node 18 exposed Web
Crypto **only** as the `webcrypto` export of `node:crypto`; `globalThis.crypto` arrived
unflagged in Node 19. A browser bundle must never contain `node:crypto` — bundlers fail on
it or inject shims, and an unused top-level builtin import survives Rollup's tree-shaker and
breaks the agadoo gate (NFR-02). Since `uuid()` is synchronous by spec, a runtime
`await import()` was not available either. So the surface was split at package-resolution
boundaries: two one-line shim files, a `#webcrypto` `imports` subpath with `node`/`default`
conditions, a second `platform: 'node'` build pair (`dist/node/{esm,cjs}`), and a `node`
condition in the exports map to serve it.

**ADR-0050 removed the reason for all of it.** The 1.x floor is Node >= 22 and Safari >= 16.4,
and `globalThis.crypto` is within that matrix by a wide margin (Node 19, Safari 11). The two
shims had therefore reduced to the same single line, and the condition was choosing between
two identical files:

```js
// webcrypto-node.js — the ?? branch now covers only runtimes below the floor
export const cryptoSurface = globalThis.crypto ?? webcrypto;
// webcrypto-browser.js
export const cryptoSurface = globalThis.crypto;
```

17.2 deliberately left this alone — it touches the exports map, and the floor PR was already
breaking enough — and filed it as 17.14 with one scheduling constraint: **spec 05 NFR-23 pins
the exports map byte-identical**, so an exports-map simplification has to land before M18,
not after.

## Decision

**1. One module, one symbol, no conditions.** `webcrypto-node.js` and `webcrypto-browser.js`
are deleted and replaced by a single `webcrypto.js` exporting
`cryptoSurface = globalThis.crypto`, imported by `crypto.js` through a **plain relative
import**. The `#webcrypto` entry and the whole `imports` field are removed from
`package.json`: a subpath alias whose only purpose was choosing between two targets has no
purpose with one.

**2. The module is kept, not inlined into `crypto.js`.** Two properties survive the collapse
and are worth a file:

- **One entropy door.** ADR-0008's most durable idea is that every CSPRNG read in the library
  goes through one symbol, so "where does randomness come from" has a single greppable
  answer and F18 (`Math.random` never, not even as a fallback) is auditable by reading one
  file.
- **The test seam.** "Runtime with no Web Crypto at all" is *security* behaviour — it must
  throw — and mocking one module is how that branch stays covered on every CI cell
  regardless of what the runtime provides. Inlining would push those suites onto global
  stubbing plus module resets, a fiddlier pattern for no gain.

**3. Two builds, not four.** With no `node:` import anywhere in the source, the
platform-neutral pair serves every runtime, so `dist/node/{esm,cjs}` and the exports map's
`node` condition are both deleted. This has a verification benefit beyond the smaller
tarball: agadoo and the size budgets already gate the neutral artifact, so **what CI measures
is now what every consumer gets** — previously Node consumers received a pair that the
shakeability gate exempted by design.

**4. `files` drops the two source-shim entries**, leaving `["dist"]`. Those entries were
already dead weight: tsup inlines `#webcrypto` at build time, so no published file ever
resolved the specifier and no consumer could reach the shims.

## Alternatives Considered

- **Keep `#webcrypto` as a single unconditional `imports` entry.** The smallest diff — no
  test-mock specifier changes at all. Rejected: an `imports` alias that selects nothing is
  ceremony that reads as if a condition still matters, and it ships in `package.json` for
  every consumer to wonder about. The relative import says exactly what happens.
- **Inline `globalThis.crypto` into `crypto.js`, delete the shim entirely.** Fewest files.
  Rejected per decision 2: it costs the single-door property and the mock seam for
  security-critical branch coverage, which is a bad trade for one saved file.
- **Keep the `node:crypto` fallback as graceful behaviour on unsupported runtimes.** The
  status quo, and what 17.2's own comment argued for ("costs one `??` and makes the package
  work rather than crash"). Rejected now the whole shim is being collapsed: the fallback's
  only beneficiary is a runtime below the declared floor, and keeping it means keeping the
  `node:crypto` import — which is what forces the two-file split, the extra build pair and
  the exports condition. The cost was never the `??`; it was everything the `??` required.
- **Keep `dist/node` for a future Node-specific optimisation.** Rejected as speculative: no
  such optimisation exists or is planned, and spec 05 is about to freeze the map. Adding a
  condition back later is additive; carrying two unused builds past 1.0 is not free.

## Consequences

- **The exports map loses its `node` condition** — an exports-map change, which spec 01 §5
  calls MAJOR-relevant. Pre-1.0 this is free; it is precisely why the item was scheduled
  here rather than deferred. Public API and behaviour are unchanged: a Node consumer now
  resolves `dist/esm/index.js` instead of `dist/node/esm/index.js`, and the two were
  behaviourally identical once both shims reduced to the same line.
- **The published tarball drops two of four builds** of the root entry, plus the two source
  shims from `files`. Measured: **93 files → 85**, the `dist/node` pair alone accounting for
  6 files and ~516 kB unpacked (its two `index.d.ts`/`index.d.cts` at 54 kB each and two
  sourcemaps at ~150 kB each dominate). Unpacked total is now 2.7 MB, packed 699 kB.
- `attw` now verifies two condition paths instead of four, and `publint --strict` sees a
  simpler map. Both still pass.
- `tools/api-floor-inventory.js`'s `crypto` entry is reworded: `globalThis.crypto` is no
  longer a floor fallback but the exotic-runtime case, and its guard reason is now F18's
  throw-rather-than-degrade contract.
- `webcrypto-shims.test.js` becomes `webcrypto.test.js`; the three suites that mocked
  `#webcrypto` now mock the module path. The `node:crypto`-fallback assertions are deleted
  along with the branch they covered, and one test in `crypto.property.test.js` that
  sanity-checked the mock by comparing the *browser* shim against the *node*-resolved one is
  rewritten to compare the mocked surface against the real one.
- **Whoever reads a stale `dist/node/` locally should delete it**: `tsup`'s `clean` only
  clears the output directories it is configured to build, so a directory no config targets
  survives a rebuild — and `files: ["dist"]` would pack it. CI builds from a clean checkout
  and is unaffected.

## References

- ADR-0008 (superseded), ADR-0050 (the floor), ADR-0017 (the api-floor inventory).
- Spec 01 §3 NFR-07 (amended); spec 05 §3 NFR-23 (the exports-map freeze this precedes).
- ROADMAP 17.14, filed by 17.2's own analysis.

# ADR-0008: One Web Crypto surface via conditional exports — never Math.random

- **Status:** Accepted
- **Date:** 2026-07-24
- **Roadmap:** 5.3 (spec §2 item 18, NFR-07)

## Context

`uuid()` (and `hashString` after it, item 19) needs a CSPRNG. The spec pins two
constraints that pull in opposite directions:

- **NFR-07 portability**: Node >= 18 LTS plus evergreen browsers must share *one* Web
  Crypto surface. But Node 18 does not expose `globalThis.crypto` by default (it arrived
  unflagged in Node 19) — there Web Crypto lives at `node:crypto`'s `webcrypto` export.
  Meanwhile a browser bundle must never contain `node:crypto`: bundlers either fail on it
  or inject shims, and an unused top-level builtin import is retained by Rollup's
  tree-shaker, which would break the agadoo gate (NFR-02).
- **F18 security**: `uuid()` must never fall back to `Math.random` — a predictable
  identifier is a silent vulnerability, worse than a loud failure.

A single source file cannot satisfy both: any static `node:crypto` import poisons browser
builds, any runtime `await import()` would force `uuid()` to become async (diverging from
the spec's synchronous signature), and CJS/ESM dual format rules out `require` tricks.

## Decision

Split the surface at **package-resolution boundaries**, never at runtime:

1. Two one-line shims export `cryptoSurface`: [`webcrypto-node.js`](../../src/main/javascript/it/d4np/utils/webcrypto-node.js)
   (`globalThis.crypto ?? webcrypto` from `node:crypto` — always defined on Node, covers
   the 18 floor) and [`webcrypto-browser.js`](../../src/main/javascript/it/d4np/utils/webcrypto-browser.js)
   (`globalThis.crypto`, possibly `undefined` — correct for browsers, workers, Deno, edge
   runtimes, and never references `node:`).
2. [`crypto.js`](../../src/main/javascript/it/d4np/utils/crypto.js) imports `#webcrypto`,
   a package.json **`imports`** subpath with `node`/`default` conditions selecting the
   shim. `tsc` (NodeNext), Vitest, and esbuild all resolve it natively.
3. The root entry ships **per-platform bundles** through the exports map's `node`
   condition: `dist/node/{esm,cjs}` (node shim baked in) beside the platform-neutral
   `dist/{esm,cjs}` (browser shim baked in) that serves bundlers, size-limit, and agadoo.
   The `#webcrypto` specifier never survives into any published bundle.
4. `uuid()` prefers `crypto.randomUUID()` and falls back to `crypto.getRandomValues()`
   with hand-forced RFC 4122 version/variant bits — the fallback is real browser surface
   area (`randomUUID` exists only in secure contexts; `getRandomValues` has no such
   restriction). With neither available it **throws `TypeError`**.

## Consequences

- One `cryptoSurface` symbol is the only entropy door for the whole crypto group;
  `hashString` (5.4) reuses it (`subtle` rides the same surface).
- The browser/default bundle stays free of `node:` builtins — agadoo and the size budgets
  keep gating the exact artifact bundlers consume; the node bundle is exempt from the
  shakeability gate by design (its builtin import is the point).
- Two more root artifacts to build and for arethetypeswrong to verify (it checks all four
  condition paths).
- Tests can rebind the surface (`vi.doMock('#webcrypto')` / stubbed globals + module
  reset), so every branch — including "no Web Crypto at all" — is coverable on every CI
  Node version regardless of whether `globalThis.crypto` exists there.

## Alternatives considered

- **Runtime detection with dynamic `import('node:crypto')`** — makes `uuid()` async,
  diverging from the spec's sync signature, and drags conditional awaits into every call.
- **`imports`-field shim left external in the published bundles** — the leftover
  `import '#webcrypto'` statement is retained by Rollup for unused externals, failing
  agadoo (NFR-02), and adds a resolution requirement on every consumer bundler.
- **`Math.random` fallback** — rejected outright (F18): silently degrading entropy is the
  worst failure mode an identifier generator can have. Throwing is the contract.
- **`browser` condition instead of `node`** — inverted defaults: unknown runtimes (Deno,
  workers, edge) would then get the `node:crypto` build and break; with `node`/`default`
  they get the `globalThis.crypto` build, which is what they actually implement.

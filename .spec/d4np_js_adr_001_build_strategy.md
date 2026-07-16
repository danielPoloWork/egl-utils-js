# ADR-001: Build & packaging — dual ESM/CJS via exports map, named exports only

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-14 |
| **Related spec** | [d4np-js.md](../d4np-js.md) (§1, §4, §5 NFR-01/02) |

## Context
v1 stated "hybrid ESM/CJS" as a goal but showed an example importing a **default aggregate object from a repository path** — a pattern that defeats tree-shaking (the aggregate object retains every module) and cannot ship as written. The packaging decision determines consumer bundle size (NFR-01), TypeScript resolution behavior, and how browser-only/peer-dependent code is isolated.

## Options considered

**A. Dual ESM+CJS via `exports` map, named exports only, subpath entries** *(chosen)*
- ✅ ESM consumers (bundlers, modern Node) get shakeable named exports; legacy CJS consumers (`require`) still work — the widest safe compatibility for a utilities library in the current ecosystem.
- ✅ Subpath entries (`d4np-js/storage`, `d4np-js/sanitize`) fence off browser-leaning and peer-dependent code from the root import; `sideEffects: false` lets bundlers drop anything unused.
- ✅ `exports` map with `types`/`import`/`require` conditions gives correct TS resolution in both module systems (validated by `publint` + `arethetypeswrong` in CI).
- ❌ Dual builds risk the "dual package hazard" (two module instances). Mitigated: the library keeps no module-level shared state except error-class identity, and error checks are `.code`-based, not `instanceof`-across-realms.

**B. ESM-only**
- ✅ Single build, no hazard, the ecosystem's endpoint.
- ❌ Still cuts off a meaningful share of CJS consumers (Jest classic configs, older toolchains) for zero functional gain to ESM users; a utilities library maximizes reach. Revisit trigger: when download stats show CJS < 5%.

**C. Default aggregate export (v1's implied shape)**
- ❌ Retains the entire library in every bundle (`import d4np` keeps all 25 modules reachable), contradicting NFR-01/02. Rejected outright; no default export exists.

## Decision
**Option A.** Build with `tsup` (esbuild) producing `dist/esm` + `dist/cjs` + bundled `.d.ts`; `package.json` declares the `exports` map (root, `/storage`, `/sanitize`, `/errors`), `sideEffects: false`, and no `main`-only fallback ambiguity. Named exports exclusively.

## Consequences
- NFR-01/02 (size budgets, shakeability) are enforceable per PR because the packaging shape guarantees them structurally.
- Error identity across dual instances is contract-tested via `.code` (documented for consumers doing `instanceof` across package boundaries).
- Moving to ESM-only later is a major-version change of this ADR with no API redesign — the named-export surface stays identical.

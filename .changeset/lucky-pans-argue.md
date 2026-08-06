---
---

Tooling only (ADR-0026): the `supply-chain` CI gate is green again with **zero audit
exceptions**. A new high advisory (GHSA-rgw5-rvv9-x895, `brace-expansion` DoS, patched in
5.0.9) reached the tree through `@vitest/coverage-v8 > test-exclude > minimatch@10`, so a
**range-scoped** pnpm override lifts only that v5 instance — leaving the v1/v2 consumers
whose export shape broke ADR-0016's unscoped attempt untouched. With it in place no
`brace-expansion` advisory remains at any severity, so the legacy `ignoreGhsas` exception
is retired rather than extended. No change to the library's behaviour, public API, or
published bytes: dev dependencies never ship (NFR-06, `files` publishes `dist` plus the two
shim sources).

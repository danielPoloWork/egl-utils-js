# Local Build & Test

How to build, test, and check `egl-utils-js` on your machine. CI runs the same commands
on Linux (Node.js 18, 20, 22); reproducing them locally avoids a red round-trip.

## Prerequisites

- **JavaScript (ES2023)** toolchain.
- **Build system:** tsup (esbuild) — dual ESM/CJS + .d.ts generated from JSDoc types (ADR-001).
- **Package manager:** pnpm (locked).
- **Formatter / linter:** Prettier, ESLint (flat config) + tsc --noEmit with checkJs (JSDoc type-check).
- **Docs:** JSDoc / TypeDoc (from JSDoc types) (for the API docs build).

## Commands

```bash
# Build
pnpm build

# Test
pnpm test

# Format check
pnpm prettier --check .

# Lint
pnpm eslint . --max-warnings 0 && pnpm tsc --noEmit

# Benchmark
pnpm bench

# Cross-artifact congruence (run before drafting any PR)
python tools/consistency_lint.py
```

## Before you open a PR

1. `pnpm prettier --check .` and `pnpm eslint . --max-warnings 0 && pnpm tsc --noEmit` are clean.
2. `pnpm test` passes; new/changed behavior is covered (≥ 95% line).
3. ESLint --max-warnings 0; vitest --detectOpenHandles (leak/handle) are green where applicable.
4. `python tools/consistency_lint.py` passes.
5. The relevant docs (README, ROADMAP, ADRs, patterns, changelog) are updated in the same
   PR — see [`../workflow/documentation.md`](../workflow/documentation.md).

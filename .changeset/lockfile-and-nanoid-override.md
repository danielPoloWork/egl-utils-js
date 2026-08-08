---
---

Build and supply chain only (BUG-0002): the lockfile is back in step with the optional
`bootstrap` peer, and the `nanoid` advisory reached through `tsup > postcss` is lifted
inside its own major line per ADR-0033. No change to the library's behaviour, public API
or budgets — the published package still declares zero runtime dependencies.

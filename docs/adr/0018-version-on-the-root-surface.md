# ADR-0018: Re-export `VERSION` from the root entry

- **Status:** Accepted
- **Date:** 2026-07-31
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** ROADMAP 8.2, `docs/releases/v0.1.0-readiness-review.md` §1.1 observation

## Context

`version.js` has exported a `VERSION` constant since the packaging milestone, kept in
lockstep with `package.json` by `tools/consistency_lint.py` and `tools/sync-version.mjs`.
It was never re-exported from the root entry (`index.js`). That was consistent with spec
§2's 25 numbered functional items, which do not list a version accessor — but the 7.6
readiness review flagged it as worth a deliberate decision rather than an accident: a
consumer importing `egl-utils-js` has no way to read the running version at all, which
is a real gap for diagnostics, telemetry tagging, and support requests ("what version are
you on?").

## Decision

Re-export `VERSION` from the root entry: `export { VERSION } from './version.js';` in
`index.js`. It is documented as a **meta export** — outside the 25 numbered functional
items, not a 26th feature — so the spec's functional count and coverage map are unaffected.

## Alternatives Considered

- **Leave it root-unexported, `egl-utils-js/version` only** — the status quo. Rejected: it
  is not actually reachable that way either (no `./version` entry exists in the `exports`
  map), so this would have meant adding a subpath entry anyway, for a single string
  constant that costs nothing to keep on the root.
- **Add a dedicated `egl-utils-js/version` subpath entry instead of a root re-export** — the
  pattern used for browser-leaning/peer-dependent code (`/storage`, `/sanitize`). Rejected:
  that separation exists to keep browser-only or peer-dependent code out of the
  zero-dependency root (NFR-06); `VERSION` is a plain string with no such cost, so forcing
  a second import path onto consumers for one constant is friction without a reason.
- **Do nothing, leave the gap** — rejected per the review: an unreachable version constant
  is a real capability gap, not a neutral omission, and the decision was explicitly deferred
  to a milestone rather than left implicit.

## Consequences

- Root entry named-export count moves from 31 to 32; `default` stays absent (spec §5 "named
  exports only" is unaffected — this adds one more named export, not a default).
- Bundle cost: negligible. `VERSION` is a single string constant; the root full-import
  budget (NFR-01, `.size-limit.json`) has ~300 B of headroom (5036 B measured against a
  5.35 kB limit) and a dedicated `single: VERSION` tree-shake scenario was added at the 1 kB
  per-function ceiling (NFR-02), consistent with every other root export.
- `version.test.js` now also asserts the root re-export equals the `version.js` export, so
  a future refactor that drops the re-export fails a test, not just a diff review.
- No ADR-0016 (release pipeline) impact: the value still comes from the single
  `version.js` source of truth that `sync-version.mjs`/`consistency_lint.py` already
  maintain — this only adds a second place it is *read* from, not a second place it is
  *set*.

## References

- ROADMAP 8.2; `docs/releases/v0.1.0-readiness-review.md` §1.1 (the observation that filed
  this item).
- `tools/sync-version.mjs`, `tools/consistency_lint.py` (the existing version-lockstep
  machinery this decision does not change).

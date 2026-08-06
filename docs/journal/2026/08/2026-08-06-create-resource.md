# 2026-08-06 — createResource, and M9 complete (roadmap 9.6)

## What got done

- `createResource` added to `web.js` and the root barrel (spec 02 F38) — a REST resource
  factory returning `{ list, get, create, update, patch, remove }`.
- [ADR-0025](../../../adr/0025-resource-repository-over-an-injected-client.md) records the
  Repository adoption and the injection decision; catalogue row 7.
- 21 example tests, `web.js` at 100% line and branch coverage, full suite 857 passing.
- **Milestone 9 is complete** — six items, six PRs, six merges.

## Decisions taken

- **The client is a parameter, never an import.** This is the decision everything else
  follows from, and the numbers make the case: `{ createResource }` is **505 B**, while
  `{ httpClient }` alone is **1304 B**. Importing the facade would have made the factory
  ~1.8 kB — a second ADR-0015 exception, and 1.3 kB charged to every caller who wanted six
  method signatures over their *own* transport. It also removes module mocking from the
  tests: the suite drives a plain recording object.
- **Duck-typed five-verb contract, checked once at construction**, so a mis-wired
  transport fails where it is wired rather than on the first request.
- **An id is data; the configured path is structure.** Ids get
  `encodeURIComponent` over the whole derived segment, so `../admin` addresses a key with
  that name and can never widen the path. `null`/`undefined` throws instead of quietly
  requesting `…/undefined` — the failure that reaches production as a 404 blamed on the
  API. The configured path keeps its separators (`'admin/users'` nests) and a leading `/`
  survives as the caller declaring an absolute path.
- **`options.id` derives the segment**, defaulting to `String`, so a composite key renders
  as one segment without pre-formatting at every call site.
- Non-goals stated rather than omitted: no caching, no normalization, no optimistic
  updates, no schema validation. A Repository mediates access; a store manages state.

## The budget crunch that did not happen

ADR-0023 (9.4) flagged that this item would be tight: an estimate of ~350 B against ~440 B
of ceiling headroom, with the prediction that the root row would have to widen to the 6 kB
ceiling itself.

The measured delta is **286 B**, not 350. Root full import: **5806 B** against the frozen
6 kB ceiling, 194 B to spare. So instead of widening, the row **tightens to its
measurement** at 5.85 kB — which is what NFR-08 asks for at wave end, and the spec-02 root
surface is now complete (F36, F37, F38 were its only root additions).

The earlier prediction was pessimistic, and is recorded as such in ADR-0025 rather than
quietly dropped. The reason it was wrong is the injection decision: had the factory
imported `httpClient`, the crunch would have been real and then some.

## Where the project stands

**M9 complete** (9.1 `/text`, 9.2 `/net`, 9.3 `/table`, 9.4 diagnostics, 9.5
`pageSessionId`, 9.6 `createResource`). Spec 02 F26–F39 are all landed; F40–F41 (the
`/logging` subpath) remain in M10, so the spec-02 coverage rows stay 🚧.

Entry sizes as they stand: root 5806 B (ceiling 6 kB), `/text` 837 B, `/net` 709 B,
`/table` 1722 B, `/storage` 2027 B, `/sanitize` 1457 B, `/errors` 291 B.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. **Cut v0.2.0** — M9 is complete, and the documented pre-1.0 policy is one MINOR per
   completed milestone. That is a `docs(release):` PR carrying
   `docs/changelog/v0/v0.2.0.md` and `docs/releases/v0.2.0.md` (the release workflow hard-
   fails without the latter); the six accumulated changesets collapse into one minor bump.
   The maintainer merges the Version PR and publishes.
3. Then **M10 / roadmap 10.1** on `feat/logging-subpath`: the level-thresholded logger
   with a pure formatter and a pluggable sink. Notes carried forward: import `fixedWidth`
   from the `/text` **module file** directly, not the barrel, or the `/logging` bundle
   swallows the whole text entry; the sink contract must catch a throwing sink
   (logging never throws into application code); `formatLogLine` strips CR/LF
   (log-injection hardening, threat model); and `normalizeError` (F37) is what feeds it —
   the logger consumes that record, it does not produce one.

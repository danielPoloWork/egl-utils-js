# ADR-0025: A REST resource as a Repository over an injected client

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F38), §3 (NFR-08); ADR-0007 (the `httpClient` facade contract), ADR-0015 (documented budget exceptions), ADR-0004 (TypeError vs domain-error split), ROADMAP 9.6; pattern: **Repository**

## Context

An application talking to a REST API writes the same six methods per collection —
list, read, create, replace, patch, delete — where the only thing that actually varies is
a path. Written by hand they are cheap individually and expensive in aggregate: the
copies drift, one forgets to encode an id, another forgets to forward the abort signal,
and a change to the calling convention has to be applied N times.

The pattern is worth a factory. The question is what the factory is allowed to know.

Two things pulled in opposite directions:

- The library already ships `httpClient` (ADR-0007). A resource factory that simply
  imports it is the shortest path, and gives the caller a one-argument API.
- `httpClient` measures 1304 B min+gzip. Anything importing it inherits that, and the
  root entry had roughly 190 B of headroom left under the frozen 6 kB NFR-01 ceiling
  after the rest of this wave landed.

There is also a security question that is easy to get wrong quietly: an id is *data*,
frequently user-controlled, and it is being interpolated into a URL path.

## Decision

Adopt the **Repository** pattern: `createResource(client, path, options?)` returns
`{ list, get, create, update, patch, remove }`, mediating between calling code and one
remote collection.

**The client is a parameter, never an import.** Any object exposing `get`, `post`, `put`,
`patch`, and `delete` backs a resource — `httpClient`, a test double, or another library's
client. This is the decision the rest follows from:

| Import | Size |
|---|---|
| `{ createResource }` | **505 B** |
| `{ httpClient }` | 1304 B |

Had the factory imported the client, its single-import scenario would have been ~1.8 kB —
a second ADR-0015 exception, and 1.3 kB charged to every consumer who wanted six method
signatures over their *own* transport. Injection also removes the need for module mocking
in tests: the suite drives a plain recording object.

**The five verbs are checked once, at construction.** A mis-wired transport fails where it
is wired, not on the first request in production.

**An id is encoded as exactly one path segment.** `encodeURIComponent` over the whole
derived segment means an id containing `/` or `..` addresses a key with those characters
in it — it cannot widen or escape the path it was meant to address. A `null` or
`undefined` id throws rather than silently requesting `…/undefined`, which is the failure
mode that reaches production as a mysterious 404. The configured `path`, by contrast, is
developer-supplied structure: its separators survive (so `'admin/users'` nests) and a
leading `/` is preserved as the caller declaring an absolute path, while each segment is
still encoded.

**`options.id` derives the segment from the id argument**, defaulting to `String`, so a
composite key renders as one segment without the caller pre-formatting at every call site.

Bodies are sent through the client's `json` option; per-call `RequestOptions` pass through
untouched, so cancellation, timeouts, and headers keep working exactly as they do on the
client itself.

## Alternatives Considered

- **Import `httpClient` and take only a path** (`createResource('users')`). One argument,
  no wiring. Rejected on the numbers above: it would triple the function's cost, charge it
  to callers using a different transport, and make the resource untestable without
  intercepting `fetch`. The convenience is one variable away for a caller who wants it
  (`const users = createResource(api, 'users')`).
- **Accept a config object** (`createResource({ client, path })`) for symmetry with
  `httpClient`. Rejected: the two positional arguments are both required and never
  optional, and the object form reads worse at the call site it exists for.
- **Require a nominal client type** rather than duck-typing five methods. Rejected —
  duck-typing is what lets a test double, a legacy wrapper, or another library's client
  work unchanged, and the construction-time check gives most of the safety a nominal type
  would.
- **Let `String(id)` handle `null`/`undefined`.** Simplest. Rejected: `…/undefined` is a
  request that looks valid, reaches the server, and returns a 404 that blames the API. The
  `TypeError` names the actual mistake, at the call site.
- **Encode the id with `encodeURI` rather than `encodeURIComponent`**, so a hierarchical
  id keeps its slashes. Rejected: that is precisely the path-widening this must prevent. A
  caller with genuinely hierarchical keys composes the path themselves, or supplies an
  `id` function that says so explicitly.
- **Add caching, response normalization, or optimistic updates.** Rejected as a different
  layer. A Repository mediates access; a store manages state. Bundling them would make the
  function unusable for anyone whose state management already exists, and it is the point
  at which this stops being a utility.
- **Add schema validation of responses.** Rejected: it would require a validation
  dependency or a hand-rolled schema language, against NFR-06's zero-runtime-dependency
  rule, and every consumer already has an opinion about validation.
- **Name the deletion method `delete`** to mirror the client. Rejected: `remove` reads
  better as a repository operation and avoids the reserved-word friction in destructuring.

## Consequences

- A collection becomes one line, and the six signatures are identical everywhere — the
  drift the hand-written copies accumulate cannot happen.
- `createResource` costs **505 B** as a single import, inside the 1 kB NFR-08 clause, and
  the root full import lands at **5806 B** against the frozen 6 kB ceiling. ADR-0023 had
  flagged a likely crunch here (an estimate of ~350 B would have left under 130 B); the
  measured 286 B delta means the row **tightens to its measurement** at 5.85 kB rather than
  widening to the ceiling. The pessimistic prediction is recorded as such rather than
  quietly dropped.
- The spec-02 root surface is now complete: F36, F37, and F38 are the only additions the
  wave makes to the root entry, and the row above is its final tightened budget.
- Cost: the caller supplies the client on every `createResource` call. That is the
  intended trade — it is what keeps the function small, transport-agnostic, and testable
  without a mocking framework.
- Cost: no caching or normalization means an application still needs a state layer. Stated
  as a non-goal so it reads as a boundary rather than an omission.
- Testing follows from the injection: the suite drives a recording plain object, and one
  end-to-end case runs the resource over a real `httpClient` with an injected `fetch` to
  prove the two compose.

## References

- Spec 02 §2 (F38), §3 (NFR-08) — `docs/specs/02_spec_core_extensions.md`
- ADR-0007 (the client this composes, without importing it), ADR-0015 (budget discipline and the exception it avoided), ADR-0004 (error-contract split)
- Pattern taxonomy: `docs/patterns/design-patterns.md` — Repository
- Implementation: `src/main/javascript/it/d4np/utils/web.js`; tests: `src/test/javascript/it/d4np/utils/create-resource.test.js`

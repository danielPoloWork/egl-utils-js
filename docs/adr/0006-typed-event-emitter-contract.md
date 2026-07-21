# ADR-0006: Typed EventEmitter — single-payload maps and non-silent isolation

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 item 6 and §3 (stateful contract), ADR-0003 (failure taxonomy), ROADMAP 4.1; Observer entry in docs/patterns
- **Pattern:** Observer (see [docs/patterns/README.md](../patterns/README.md))

## Context

The spec asks for a *minimal typed emitter* — `on`/`once`/`off`/`emit` with "per-listener
exception isolation reported via `'error'`". Two design axes need deciding once, because
this class is the library's **typed-API template** under JSDoc + strict `checkJs`: how the
`EventMap` generic shapes listener signatures, and what exactly happens when listeners
throw — including the case the spec leaves open, a throwing listener with *no* `'error'`
subscriber. A constraint peculiar to this codebase: the generics must stay expressible in
JSDoc without conditional/variadic-tuple gymnastics, or every consumer call site pays the
complexity.

## Decision

`EventEmitter<EventMap>` where `EventMap` maps each event name to its **single payload
type**; `emit(event, payload)` and listeners receive `(payload)`. `on`/`once` return an
**idempotent unsubscribe function** (and `off(event, listener)` also exists, removing one
registration per call). Dispatch is **snapshot-based**: subscriptions changed during an
emit affect only later emits; `once` deregisters before its listener runs. Isolation is
**collect-then-report**: every listener always runs; collected exceptions go to the
`'error'` listeners present at report time (consumers declare `error: unknown` in their map
for typed handling; exceptions thrown *by* `'error'` listeners are swallowed to forbid
recursion); if no `'error'` listener is subscribed, `emit` **throws synchronously after all
listeners have run** — the single failure, or an `AggregateError` — so a listener bug is
never silently lost and never crosses async boundaries as an uncatchable crash.

## Alternatives Considered

- **Tuple-args maps** (`{ data: [string, number] }`, listeners `(...args)`) — the
  TypeScript-community convention. Rejected: variadic tuple generics are where JSDoc
  typing gets brittle and call-site errors get unreadable; a single payload object covers
  the same ground with one wrapping brace and keeps every signature simple.
- **Node-style `this` chaining and behavior** (`on` returns the emitter; unhandled
  listener exceptions crash `emit` midway) — familiar. Rejected: chaining loses the
  unsubscribe closure (forcing consumers to keep listener references), and Node's
  first-throw-aborts-dispatch is precisely the isolation failure the spec rules out.
- **Silently swallowing failures when no `'error'` listener exists** — maximally
  defensive. Rejected: it converts listener bugs into invisible ones; never-silent is the
  taxonomy's standing posture (ADR-0003/0005).
- **Async rethrow via `queueMicrotask`** for the no-`'error'`-listener case —
  platform-like (uncaught exception). Rejected: it crashes the host process where a
  synchronous throw gives the emitting caller a catchable, testable signal at the exact
  call site that triggered the dispatch.

## Consequences

- Every later typed surface (debounce/throttle wrappers, storage events if any) copies
  this JSDoc-generics shape — the sets-pattern payoff; `Extract<keyof EventMap, string>`
  keys and single-payload listeners are the house convention.
- Consumers get exact payload types at call sites and an unsubscribe closure that makes
  inline-arrow subscriptions safely removable.
- `emit` can throw (only when a listener failed and nobody subscribed `'error'`) — a
  documented, deliberate sharp edge that makes failure handling a visible choice.
- Snapshot dispatch and once-before-call semantics are frozen behavior, contract-tested;
  changing either is breaking.
- Cost: entry objects (one per registration) rather than bare function references — the
  price of duplicate-registration support and precise `off`.

## References

- Spec §2 item 6, §3 (stateful modules and cancellation/error columns).
- Observer pattern — docs/patterns/design-patterns.md taxonomy.
- Node.js `events` module semantics (the divergences above are deliberate).

# ADR-0010: Storage wrappers — silent in-memory fallback, quota as StorageError

- **Status:** Accepted
- **Date:** 2026-07-30
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 items 21–22 (F21/F22), ADR-0003 (`.code` identity), ADR-0004 (TypeError vs domain-error split), ADR-0007 (Facade precedent), ROADMAP 6.1

## Context

`localStorageWrapper`/`sessionStorageWrapper` wrap the Web Storage API, which is hostile in
several ordinary situations: it is **absent** (Node, SSR), **throws on access** (sandboxed
iframes raise `SecurityError` just reading `globalThis.localStorage`), and **rejects writes**
(private browsing / disabled storage give a 0-quota store that throws on `setItem`). The
spec (F21) asks for a "safe interface with in-memory fallback when storage is unavailable"
and "quota-error surfacing (`StorageError`)". Two questions have non-obvious answers: *when*
does the wrapper decide it has no real store, and *which* failures are the caller's problem
(a thrown error) versus the environment's (a silent fallback)?

## Decision

1. **Availability is proven by a probe, once, lazily.** On first use the wrapper reads the
   global inside a `try`, then writes and removes a probe key. Any throw — missing global,
   `SecurityError`, write rejection — resolves the backing store to a per-wrapper `Map`.
   The decision is memoized: a wrapper does not oscillate between real and memory stores
   mid-session. Resolution never happens at module load, so importing `egl-utils-js/storage`
   has **no side effects** (`sideEffects: false`, NFR-02) and is safe in Node.

2. **Unavailability is a silent fallback; a genuine quota failure is a `StorageError`.**
   These are different events. "No usable store exists" is environmental and expected — the
   wrapper degrades to memory rather than making every call site handle it, and exposes the
   truth via `isPersistent()` for callers who care. But once a *real* store is in use, a
   `setItem` that throws (quota exceeded) is a real write failure the caller must see:
   surfaced as `StorageError` (identity by `.code = 'EGL_STORAGE'`, ADR-0003), never
   swallowed into the fallback.

3. **The `TypeError`/`StorageError` split follows ADR-0004.** A non-string key or a
   top-level non-JSON-serializable value (`undefined`, function, symbol — for which
   `JSON.stringify` returns `undefined`) is a **programmer error → `TypeError`**, thrown
   before touching storage. A `JSON.stringify` that throws natively (circular reference,
   `BigInt`) is already a `TypeError` and propagates unchanged. Corrupt stored JSON found on
   read (written out-of-band by another actor or an older version) is an environmental
   **domain failure → `StorageError`**, wrapping the `SyntaxError` as `cause`.

4. **JSON is the only value contract.** `set` serializes, `get` parses and returns the
   default (`undefined` unless supplied) for an absent key. `has` distinguishes a stored
   `null` from an absent key — `get`'s default cannot.

## Consequences

- Callers get a store that always works: no `try`/`catch` around every read in Node or
  private mode. The escape hatch for "did my data actually persist?" is `isPersistent()`.
- The silent fallback is a documented behavior, not a surprise (spec §3 failure table:
  "silent fallback documented"). Data written to the in-memory fallback does not survive a
  reload — that is the honest consequence of an unavailable store, and `isPersistent()`
  lets a caller warn the user if it matters.
- One shared factory builds both exports (composition, ADR-0007 house style); local vs
  session differ only in which global they read.
- Because tests re-import the module to inject stubbed globals, error identity in tests is
  checked by `.code`, not `instanceof` — the same cross-realm rule ADR-0003 exists for,
  now exercised by the test harness itself.

## Alternatives considered

- **Throw when storage is unavailable** (no fallback) — forces every Node/SSR/private-mode
  caller into defensive `try`/`catch`, defeating "safe interface". Rejected by F21.
- **Existence check instead of a write probe** (`typeof localStorage !== 'undefined'`) —
  misses the private-browsing case where the global exists but every write throws, and the
  sandboxed-iframe case where merely reading the global throws. The probe covers both.
- **Silently swallowing quota errors too** (fall back to memory on first quota failure) —
  hides real data loss on a working store behind a false success. Quota is a failure the
  caller must be able to act on; only *unavailability* is silent.
- **Storing `undefined`/non-serializable values** (e.g. as `"null"`) — loses the
  absent-vs-stored distinction and round-trips wrong; rejected with a `TypeError` instead.

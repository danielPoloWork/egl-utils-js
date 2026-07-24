# ADR-0007: httpClient — a fetch facade with a no-token-storage auth contract

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 item 16 and §3, ADR-0003 (HttpError), ADR-0004 (timeout/anySignal), ROADMAP 5.1; Facade entry in docs/patterns
- **Pattern:** Facade (see [docs/patterns/README.md](../patterns/README.md))

## Context

`httpClient` wraps `fetch` with the four behaviors the spec names — default and
per-request timeouts merged with caller signals, per-request bearer auth, content-type-aware
JSON handling, and `HttpError{status, body}` on non-2xx — and it is a **security surface**:
it composes the `Authorization` header. The dangerous convenience every HTTP wrapper is
tempted by is *token storage* (a `token` config field), which silently becomes a stale-token
and revocation bug factory. Separately, the library already owns exactly the cancellation
machinery a request needs (ADR-0004's `timeout` combinator with `anySignal` merging and the
`TimeoutError`/`AbortError` taxonomy), so the client must not grow a second one. Tests must
run without a network, so the fetch implementation has to be injectable.

## Decision

`httpClient(config)` is a **factory returning a small facade** (`request` + verb helpers)
over an injectable `fetch` (default `globalThis.fetch`). Every request runs inside the
library's own `timeout` combinator: the per-request or default (30 s) budget is merged with
the caller's `signal`, the fetch receives the merged signal, and failures follow ADR-0004
(`TimeoutError` on expiry, `AbortError` on caller cancellation). **Auth is a callback, never
a value**: `auth()` runs once per request, its returned token is attached as
`Authorization: Bearer …` and immediately forgotten; `undefined` means no header; a
throwing/rejecting `auth` fails the request *before anything is sent* (fail-closed); an
explicit `Authorization` header at client or request level wins and `auth` is not invoked.
Response bodies are parsed by declared media type only — `application/json` and `…+json`
parse as JSON (string comparison, no regex, no sniffing), everything else returns text,
`204`/empty JSON returns `undefined`. Non-2xx rejects with `HttpError` carrying `status`
and the parsed body. Headers merge case-insensitively via the platform `Headers` class,
request over client. Retries, redirects/cookie policy, query building (item 17), and
streaming are documented non-goals — retry composes as `retry(() => client.get(…))`.

## Alternatives Considered

- **A `token` config value** — the common convenience. Rejected: the client would hold a
  credential, making rotation/revocation the library's problem and stale tokens the
  caller's silent bug; a per-request callback keeps custody with the caller at the cost of
  one closure.
- **Calling `auth` even when an explicit `Authorization` header is present** — simpler
  rule. Rejected: it runs a credential-producing side effect whose result is then
  discarded; the explicit header is the caller's deliberate override.
- **A second, request-local timeout implementation** — independence from `async.js`.
  Rejected: duplicating signal-merge machinery is precisely how the two copies drift;
  composing the tested combinator keeps one cancellation semantics (and one test surface).
- **Interceptor/middleware chains (axios-style)** — extensible. Rejected: a minimal typed
  facade is the spec's ask; interceptors reintroduce ordering and mutation questions the
  library would then own forever.
- **Content sniffing (try JSON, fall back to text)** — forgiving. Rejected: it masks
  wrongly-labeled APIs and makes the return type depend on body contents rather than the
  declared contract.

## Consequences

- Cancellation/timeout behavior is *inherited*, not re-specified: anything ADR-0004 fixes
  or documents applies to HTTP requests automatically.
- The no-storage contract is testable and tested (rotating-token closures observe fresh
  values per request; no field of the client ever holds a credential).
- `HttpError.body` carries the parsed error payload, so API error envelopes are directly
  inspectable in `catch` blocks via the stable `EGL_HTTP` code.
- Injectable `fetch` makes the whole suite network-free and lets consumers supply
  polyfills or instrumented clients.
- Cost: one closure per configured client and the discipline of adding *no* convenience
  state later — any future caching (e.g. auth memoization) belongs in the caller's
  callback, not here.

## References

- Spec §2 item 16, §3 (stateful contract, failure column), §6 (usage example).
- ADR-0003 (HttpError), ADR-0004 (signal-first cancellation), ADR-0005 (no-regex posture,
  reused in the media-type check).
- OWASP ASVS V2 (credential handling: minimize storage and lifetime).

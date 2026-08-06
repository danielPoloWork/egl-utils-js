# Threat model — egl-utils-js

> **Owner:** the **security-auditor** role (it drafts here; findings feed the audit risk
> register). Produced and kept current by the **audit threat-modeling sub-mode**
> (`/eados security` → `/eados audit`). Method: **STRIDE**. Scaffolded empty on purpose —
> an explicit `n/a` with a reason is honest; an unexamined boundary is not.

## 1. Scope & trust boundaries

List every boundary an attacker could stand on either side of — network edges, process/privilege
boundaries, tenancy separation, third-party services — and for each: the **untrusted inputs**
that cross it, and the **assumptions** the design makes about it.

| Boundary | Untrusted inputs crossing it | Assumptions |
|---|---|---|
| **Filter expressions** (`compileFilter`, `egl-utils-js/table`) — an end user types into a column filter box in the host application; the string reaches the library verbatim | The expression string, and the cell values it is evaluated against (server data, user data, or both) | The host calls `compileFilter` once per expression and applies the predicate per row; expressions are never persisted or shared between users as executable content; the library never reflects the expression into markup (that is the host's concern) |
| **Log records** (`logger`/`formatLogLine`, `egl-utils-js/logging`) — an application logs values it did not author: request fields, record contents, error messages, and a correlation `id` produced by an injected function | The `message` (often interpolated from user or server data), the `args`, the `name`, and the resolved `id` | The rendered line is appended to a line-oriented destination (console, file, log shipper) whose consumers treat a newline as a record separator; the host decides what is worth logging, and the library never decides that a value is safe to *store* — only that it cannot break the line format |
| _e.g. public HTTP edge_ | _request bodies, headers, auth tokens_ | _TLS terminated upstream_ |

## 2. STRIDE pass

Work the six categories (**S**-**T**-**R**-**I**-**D**-**E**) **per boundary/component** above.
Every cell gets an entry — a threat, a mitigation, or an explicit `n/a (reason)`; never a blank.

| Category | Threat considered | Boundary / component | Mitigation / control | Status |
|---|---|---|---|---|
| Spoofing — is the caller who it claims? | n/a — the primitive has no notion of identity and performs no authentication | Filter expressions | n/a (reason: pure function of its arguments) | ☑ |
| Tampering — can data/code be altered in flight or at rest? | An expression could inject executable behaviour if it were compiled to code | Filter expressions | No `eval`, no `Function`, and **no `RegExp` is constructed from the expression** — it is dispatched on a leading token and evaluated with `includes`/`startsWith`/`endsWith`/numeric comparison ([ADR-0021](../adr/0021-filter-expression-grammar.md)). Custom operators are supplied by the host in code, never by the expression | ☑ |
| Repudiation — can an action be denied for lack of a trail? | n/a — filtering is a read-side transform that changes no state and produces no auditable action | Filter expressions | n/a (reason: no side effects) | ☑ |
| Information disclosure — can data leak across a boundary? | A crafted expression could probe values the user should not see | Filter expressions | The predicate only answers yes/no about values the host already passed it; it reads nothing else and returns no data. Which rows a user may see remains the host's authorization decision, applied before filtering | ☑ |
| Denial of service — can the surface be exhausted? | **The realistic threat.** A pathological expression evaluated per row per keystroke could be made superlinear — the ReDoS shape | Filter expressions | No backtracking engine is involved at all; evaluation is O(\|value\| + \|expression\|) with no nesting. Expressions past 1024 code units stop being parsed as a grammar and match literally, so a very long input cannot even select a code path (NFR-09). Normalization happens once at compile time, not per row. Asserted by a fast-check totality property over arbitrary Unicode | ☑ |
| Elevation of privilege — can a caller gain authority it was not granted? | n/a — the module has no privileged operation, no I/O, and touches no platform global | Filter expressions | n/a (reason: pure, Node-safe, zero-capability surface) | ☑ |
| Spoofing — is the caller who it claims? | **Log injection.** A newline inside any interpolated field lets attacker-controlled text pose as a *separate log record* — a forged `ERROR` line, a fake audit entry, or a value that shifts every downstream parser's column alignment | Log records | Every field interpolated into a line — `message`, `name`, and `id` — has its CR/LF runs collapsed to a single space, so one record renders as exactly one line for **every** input ([ADR-0027](../adr/0027-logging-formatter-sink-split.md)). The guarantee is asserted by a fast-check property over arbitrary strings, not by examples, and again in the browser suite. The `id` is covered deliberately: it arrives from an injected function, so it is no more trusted than the message | ☑ |
| Tampering — can data/code be altered in flight or at rest? | A record could carry executable content, or a hostile value could hijack formatting through `toString` | Log records | Formatting only ever produces a string: no `eval`, no `Function`, no markup, no `RegExp` built from record content. A `toString` that throws is caught, costs that one record, and is reported once — it cannot abort the caller (`ADR-0027`). Structured `args` are passed to the sink untouched rather than interpolated | ☑ |
| Repudiation — can an action be denied for lack of a trail? | **The trail itself is the asset.** A failing sink that threw would take the surrounding `catch` block with it — destroying the error being recorded — or, worse, silently drop records while appearing healthy | Log records | Record construction and dispatch sit inside one `try`: a dead transport, throwing clock, or throwing id function costs that single record and is reported once through `console.error`, so a gap is visible rather than silent, and the original application error still propagates. The library makes no completeness or durability claim beyond that — a durable audit trail is the host's sink | ☑ |
| Information disclosure — can data leak across a boundary? | The genuine risk is the host logging secrets (tokens, PII) and the library widening their reach | Log records | The library adds no destination of its own: with no `sink` it writes to `console` and nothing else — no network, no file, no storage. It performs **no redaction** and claims none; deciding what may be logged stays with the caller, and a redacting `format` or `sink` is the injection point for it. `pageSessionId`, the intended `id` source, is a correlation id and explicitly not a credential ([ADR-0024](../adr/0024-page-session-id-scope-and-budget.md)) | ☑ |
| Denial of service — can the surface be exhausted? | A very large message or arg array could make formatting expensive per record; a `silent` logger could still pay for building records | Log records | The threshold check runs **before** anything is built — below-threshold calls read no clock, resolve no id, allocate no record. Formatting is a single linear pass with no backtracking (CR/LF collapse) and fixed-width columns bound the metadata portion. Volume control (rate limiting, sampling, batching) belongs to the sink and is out of scope here | ☑ |
| Elevation of privilege — can a caller gain authority it was not granted? | n/a — the module holds no privileged capability: no I/O beyond an optional `console` write, no platform global other than `console`, and no state shared between instances (a module-level default logger was rejected precisely to avoid shared mutable configuration) | Log records | n/a (reason: no privileged operation to gain; see the Singleton rejection in [ADR-0027](../adr/0027-logging-formatter-sink-split.md)) | ☑ |

## 3. Findings → the risk register

A threat that survives analysis lands in the audit **risk register** with its severity
(low/medium/high/critical), affected component, realistic impact, and a concrete mitigation — the
same record shape the audit phase emits. A confirmed, reproducible defect additionally becomes a
[bug-ledger](../bugs/README.md) record; a vulnerability needing coordinated disclosure becomes a
**draft** advisory the human publishes.

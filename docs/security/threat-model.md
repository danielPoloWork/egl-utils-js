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

## 3. Findings → the risk register

A threat that survives analysis lands in the audit **risk register** with its severity
(low/medium/high/critical), affected component, realistic impact, and a concrete mitigation — the
same record shape the audit phase emits. A confirmed, reproducible defect additionally becomes a
[bug-ledger](../bugs/README.md) record; a vulnerability needing coordinated disclosure becomes a
**draft** advisory the human publishes.

# ADR-0005: validateEmail — a hand-rolled linear scan, no regex

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec §2 item 15, NFR-05 (ReDoS resistance), ADR-0004 (TypeError contract split), ROADMAP 3.6

## Context

`validateEmail` classifies untrusted input, which makes its **worst-case running time a
security property**: NFR-05 requires linear time with 10^6 adversarial inputs each
completing in under 1 ms. Email validation is the canonical ReDoS example — the naive
regexes that circulate widely exhibit catastrophic backtracking, and V8's regex engine is a
backtracking engine, so even a carefully-written pattern carries its linearity as an
*unproven claim about engine internals* rather than a property of the code. The spec asks
for a "linear-time, backtracking-free RFC 5322 practical subset" with the 64/255 length
caps enforced before matching. A second constraint shapes the options: NFR-06 forbids
runtime dependencies, ruling out linear-engine libraries.

## Decision

`validateEmail` is a **hand-rolled single-pass character scan with no regular expression
anywhere** — linearity holds by construction and is verifiable by reading the loop, not by
reasoning about an engine. Length caps run before any per-character work (total ≤ 320,
local ≤ 64, domain ≤ 255), so no input costs more than ~320 character checks. The scan
allocates nothing per call (`indexOf` + `charCodeAt` on the original string, no substring
slices), keeping the hot path GC-quiet — which also makes the NFR-05 timing gate stable.
The accepted subset is explicit: unquoted dot-atom local part (RFC 5322 `atext`), domain of
≥ 2 labels (1–63 alphanumeric-and-inner-hyphen characters each, final label ≥ 2). Quoted
local parts, comments, IP-literal domains, single-label domains, and non-ASCII input are
documented non-goals. Non-string input throws `TypeError` (ADR-0004 split); the boolean
answers only "is this string a valid address under the subset".

## Alternatives Considered

- **A carefully-written "safe" regex** — idiomatic and compact. Rejected: its linearity is
  a claim about V8's backtracking engine that cannot be proven from the source, degrades
  silently if the pattern is later "improved", and the reviewer burden of re-verifying
  safety on every edit is exactly the arms race NFR-05 exists to avoid.
- **A linear-time regex engine (RE2 binding or `re2js`)** — machine-checked linearity.
  Rejected: a runtime dependency, forbidden outright by NFR-06.
- **Full RFC 5322 grammar (quoted strings, comments, IP literals)** — maximal acceptance.
  Rejected: the long tail (nested comments, quoted-pair escaping) is where both complexity
  and historical validator bugs live; real-world addresses that fail the practical subset
  are overwhelmingly typos, not working mailboxes. Scope kept as the documented subset.
- **Validating via `URL`/platform parsers** (`new URL('mailto:…')`) — zero owned code.
  Rejected: platform parsers accept far more than a mailbox grammar, differ across
  runtimes, and provide no length-cap or subset control — the answer would not be portable
  or specifiable.

## Consequences

- The NFR-05 gate is honest: the 10^6-adversarial-input timing test measures a function
  whose worst case is structurally bounded, so the test verifies the contract rather than
  hoping the engine behaves.
- Zero per-call allocation makes per-input timing assertions stable (no GC pauses from the
  validator itself) and benchmark-friendly for M7.
- The subset is a frozen public contract: widening it (e.g. quoted local parts) is a
  deliberate spec change, and any such change must preserve the no-regex, single-pass
  construction or revisit this ADR.
- Cost: ~100 lines of owned scanning code and two charcode-range helpers, versus one
  regex line — accepted as the price of a provable security property.
- The rejected inputs are documented in the JSDoc so support questions ("why is
  `user@localhost` invalid?") have a written answer.

## References

- Spec §2 item 15 and NFR-05; ROADMAP 3.6.
- OWASP: Regular expression Denial of Service (ReDoS) — the email-regex canonical case.
- RFC 5322 §3.2.3 (atext / dot-atom), RFC 5321 §4.5.3.1 (64/255 length limits).

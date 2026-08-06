# ADR-0020: Strict IPv4 parsing, and a fixed-width sortable key codec

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Daniel Polo (owner), agent (tech-lead persona)
- **Related:** spec 02 §2 (F29-F32), §3 (NFR-08); ADR-0004 (TypeError vs domain-error split), ADR-0005 (no regex on a validation surface), ADR-0019 (the spec-02 subpath family), ROADMAP 9.2

## Context

`/net` parses addresses that arrive from users, config files, query strings, and
databases. Two questions had to be answered before writing a line of it, because both
are contracts a caller builds on and neither can be changed later without breaking them.

1. **How permissive is the parser?** "IPv4 address" is not one grammar. The historical
   `inet_aton` family accepts `127.1` (shorthand), `0177.0.0.1` (octal), `0x7f.0.0.1`
   (hex), and `2130706433` (a bare 32-bit integer) — all meaning `127.0.0.1`. Modern
   stacks disagree about which of these they still honor: `parseInt`-based hand-rolled
   checks read `010` as ten, C's `inet_aton` reads it as eight, and browsers'
   URL parsers historically resolved octal in hostnames. Python's `ipaddress` module
   rejected leading zeros outright in 3.9.5 (CVE-2021-29921) precisely because a
   *validator* and a *resolver* disagreeing is the mechanism of an SSRF or
   allowlist-bypass: `010.0.0.1` passes a check that reads it as `10.0.0.1` and then
   connects to `8.0.0.1`.
2. **How does an address sort and index?** Dotted form sorts wrong as a string —
   `'10.0.0.1'` lands before `'9.0.0.1'` — so every application that lists addresses
   re-invents either a sort comparator that parses on every comparison, or an encoding.
   The encoding needs a rule; the useful ones are fixed-width digits, a 32-bit integer,
   or a per-octet tuple.

## Decision

**The parser is strict: exactly four decimal octets, `0`-`255`, single dots, no leading
zeros, no whitespace, no hex, no octal, no shorthand, no bare integers.** Every legacy
form is rejected. `isIpv4` and `parseIpv4` accept exactly the same language, so a check
and the parse that follows it can never disagree. Following ADR-0005, the scan is a
hand-rolled single pass over `charCodeAt` with **no regular expression**, so the parser's
language is exactly what the code says rather than what a regex dialect implies.

Per the ADR-0004 split, **invalid content returns `null` and never throws**; a wrong
argument *type* throws `TypeError`. `subnetMaskFromPrefix` is equally strict about
notation — `'/24'`, `'24'`, and `24` are the accepted shapes, and `'/024'` is not one.

**The sortable key is fixed-width decimal: three zero-padded digits per octet**
(`192.168.1.10` → `'192168001010'`). Lexicographic order over keys is therefore
identical to numeric order over addresses, and — because the width is fixed — the key of
a network prefix is a literal prefix of the key of every address inside it, so
`startsWith` answers octet-aligned containment. The `{ octets: 1-4 }` option parses
partial dotted forms (`'192.168'`) into the corresponding short key.

## Alternatives Considered

- **Accept the legacy `inet_aton` forms** (shorthand, octal, hex, integer) — maximal
  compatibility, and what `ping` accepts. Rejected because this library's parser will be
  used to *decide* things (allowlists, routing, filters) while some other component
  resolves the same string, and any disagreement between the two is a vulnerability, not
  a quirk. Compatibility with a 1983 convenience is worth less than an unambiguous
  contract.
- **Accept leading zeros but normalize them as decimal** (`'010'` → 10) — friendlier to
  zero-padded data exported from spreadsheets and legacy databases. Rejected as the worst
  of both worlds: it is *a* disambiguation, but not the one C, older browsers, or the
  reader expect, so it recreates the CVE-2021-29921 divergence with this library on the
  permissive side. Callers with zero-padded columns can strip the padding, an explicit
  and visible step.
- **Return a typed `Ipv4ParseError` instead of `null`** — richer diagnostics, consistent
  with the `DurationParseError` of F25. Rejected because the primary use of these
  functions is *validating* untrusted input, where invalidity is the expected outcome, not
  an exception; `validateEmail` (F15) set that precedent, and `try`/`catch` in a filter
  loop is both slower and noisier than a `null` check. `parseDuration` differs precisely
  because it has no predicate sibling.
- **Encode the key as a 32-bit integer** (`3232235786`) — compact, and orders correctly
  as a number. Rejected because it does not order correctly as a *string*, which is what
  a database column, a URL parameter, or a JSON document usually holds; and because a
  prefix cannot be expressed as a prefix, so network containment needs range arithmetic
  instead of `startsWith`.
- **Encode as a fixed-width hexadecimal key** (`'c0a8010a'`) — shorter (8 chars) and
  still correctly ordered. Rejected because it is unreadable in a log or a database
  browser: the decimal key is diff-able and greppable against the dotted form, which
  matters more than four characters per row.
- **Support IPv6** — the obvious next question. Deliberately out of scope for this item:
  IPv6 has its own canonicalization rules (RFC 5952 zero compression), a different
  strictness debate, and a much larger surface. It is a future roadmap item and a
  separate entry-budget conversation, not a quiet extension of these functions.

## Consequences

- A caller can rely on `isIpv4(v) === (parseIpv4(v) !== null)` and on both agreeing with
  what `ipv4ToKey` will accept — the property suite asserts all three.
- Addresses sort correctly with `sort((a, b) => ipv4ToKey(a).localeCompare(ipv4ToKey(b)))`
  and index correctly as a plain string column; octet-aligned network membership is a
  `startsWith`. Non-octet-aligned CIDR containment (a `/26`) is **not** covered by the key
  and needs mask arithmetic — `subnetMaskFromPrefix` provides the mask.
- Cost: input from legacy systems that zero-pads octets is rejected rather than silently
  reinterpreted. This is the intended trade — the rejection is visible, a
  misinterpretation would not be.
- Cost: rejecting the shorthand forms means this library will refuse strings that `ping`
  accepts. The JSDoc names them explicitly so the refusal reads as a decision rather than
  a gap.
- `/net` measures 709 B min+gzip for the whole entry and 157-377 B per single import, so
  the NFR-08 budget lands at 0.8 kB with the entry proven shakeable per function.
- No platform global is touched, so the module is Node-safe by construction and adds
  nothing to the ADR-0017 API-floor inventory.

## References

- Spec 02 §2 (F29-F32), §3 (NFR-08), §6 (round-trip and ordering laws) — `docs/specs/02_spec_core_extensions.md`
- ADR-0004 (error-contract split), ADR-0005 (no regex on validation surfaces), ADR-0019 (subpath family and the four-edit wiring)
- CVE-2021-29921 — leading-zero octets in Python's `ipaddress`, the canonical instance of validator/resolver divergence
- Implementation: `src/main/javascript/it/d4np/utils/net.js`; laws: `src/test/javascript/it/d4np/utils/net.property.test.js`

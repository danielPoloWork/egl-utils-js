# 2026-08-06 — The /net subpath (roadmap 9.2)

## What got done

- Shipped `egl-utils-js/net` (spec 02 F29–F32): `isIpv4`, `parseIpv4`, `formatIpv4`,
  `ipv4ToKey`, `ipv4FromKey`, `subnetMaskFromPrefix` —
  [`net.js`](../../../../src/main/javascript/it/d4np/utils/net.js).
- [ADR-0020](../../../adr/0020-strict-ipv4-parsing-and-the-sortable-key-codec.md) records
  the two contracts this item had to settle: how permissive the parser is, and how an
  address encodes for sorting and indexing.
- 41 tests (29 examples, 12 property laws) at 100% line and branch coverage; the
  four-edit subpath wiring from ADR-0019 applied unchanged for the second time.

## Decisions taken

- **Strict parsing.** Four decimal octets, no leading zeros, no `inet_aton` shorthand,
  octal, hex, or bare-integer forms. The reasoning is a security one: this parser will be
  used to *decide* things while some other component resolves the same string, and any
  divergence between a validator and a resolver is the mechanism behind allowlist-bypass
  and SSRF bugs (the CVE-2021-29921 class). `isIpv4` and `parseIpv4` accept exactly the
  same language so the check and the parse can never disagree.
- **No regex** anywhere — a hand-rolled `charCodeAt` scan (ADR-0005 precedent from
  `validateEmail`), so the accepted language is what the code says rather than what a
  regex dialect implies.
- **`null` for invalid content, `TypeError` for wrong types** (ADR-0004 split), following
  `validateEmail` rather than `parseDuration`: validating untrusted input is the primary
  use, so invalidity is an expected outcome, not an exception. No new error class.
- **Fixed-width decimal key** (three zero-padded digits per octet) over a 32-bit integer
  or hex: it is the only encoding that keeps *string* order equal to address order and
  makes a network prefix a literal prefix of the key, so octet-aligned containment is a
  `startsWith`. It also stays greppable against the dotted form in a log or a DB browser.
- IPv6 is explicitly out of scope for this item (its own canonicalization rules and
  budget conversation) — recorded in the ADR rather than left as an implied gap.

## Numbers

- `/net` entry: **709 B** min+gzip → NFR-08 budget set at 0.8 kB (the figure spec 02
  already predicted; no spec amendment needed this time, unlike 9.1).
- Per-function imports: 157 B (`formatIpv4`) to 377 B (`ipv4ToKey`) — tree-shaking proven
  per export, well under the 1 kB NFR-08 clause.
- No new platform globals, so `check:api-floor` is green by construction and the
  ADR-0017 inventory is untouched.

## Where the project stands

M9 is two of six items done (9.1 `/text`, 9.2 `/net`); spec 02 §§1–6 remain 🚧. Root
entry still measured at ~5.1 kB against the frozen 6 kB ceiling — nothing this wave has
spent it.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start roadmap **9.3** on `feat/table-query-primitives` — the wave's decision-heavy
   item: `compileFilter` (the total filter grammar with a pluggable `{operators}`
   extension point), `comparator` (auto type detection, `Intl.Collator` with a
   configurable locale, empties-last), and `paginate`, on a new `/table` entry. It needs
   two ADRs (grammar; comparator semantics + the note that `Intl` is ECMA-402 scope and
   therefore not an api-floor entry), the first `docs/patterns/README.md` rows of the wave
   (Interpreter, Strategy), and a threat-model update — filter expressions are a new
   untrusted input with a length cap and no user-input RegExp (NFR-09).

# ADR-0084: A URL is not text — parse before you decide, and pay for it where the measurement says

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Daniel Polo
- **Related:** [spec 09](../specs/09_spec_hardening.md) §2 F126-F127, §3 NFR-46/NFR-47/NFR-48,
  ROADMAP 23.1; [ADR-0083](0083-the-deferred-pile-re-dispositioned.md) (the triage that adopted
  this item, and whose call-site count this record corrects),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (escape-by-default, which
  covers content and not URLs), [ADR-0030](0030-sanitize-is-a-required-parameter.md) (the rule a
  URL guard must not bend), [ADR-0012](0012-sanitize-default-profile.md) (the allow-list posture
  this is the URL spelling of),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (**the 25 kB `/bootstrap` clause this record
  amends**), [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (the option contract, and the
  one place this item trades it for bytes),
  [ADR-0061](0061-served-bytes-are-their-own-accounting.md) (F87, which priced the new chunk),
  [ADR-0082](0082-a-figure-nobody-checks-is-prose.md) (the figures gate that caught five rows this
  item moved)

## Context

Escape-by-default has been this library's answer to untrusted record data since F52: content
reaches the DOM through `textContent`, and markup needs an explicit `{html, sanitize}` pair. It
says nothing about a **URL**, because an `href` is not text — it is an instruction. Seven call
sites across the Bootstrap builders write an `href` or a `src` taken from caller or record data,
and none looked at the protocol:

| File | Attribute | What it renders |
|---|---|---|
| `bootstrap-composites.js` | `src` | the card image |
| `bootstrap-composites.js` | `href` | a list-group item |
| `bootstrap-composites.js` | `href` | a breadcrumb link |
| `bootstrap-nav.js` | `href` | the navbar brand |
| `bootstrap-nav.js` | `href` | a nav item |
| `bootstrap-nav.js` | `href` | a nav child item |
| `bootstrap-overlays.js` | `src` | a carousel image |

A record field containing `javascript:fetch('/api/keys')…` became a live link with the page's
authority, and `docs/security/threat-model.md` described this boundary's control as *"they render
exactly what they receive"* — which, for an `href`, is not a control.

**A correction, carried forward rather than edited away.** ADR-0083 and spec 09 say *eight* call
sites. The eighth was `bootstrap-elements.js:387` — a line inside a **JSDoc example**, counted by
the audit's grep and never executed. Seven is the number, it is what the tests assert, and ADR-0046
set the precedent for carrying a miscount forward in the record that found it rather than rewriting
the one that made it.

## Decision

**1. Parse, then decide.** `safeUrl(value, options)` resolves the value with `new URL()` against a
non-resolvable probe base and looks the resulting `protocol` up in a `Set`. No regular expression
ever sees the input. This is the whole security argument, because the URL grammar does four things
every string-inspecting version of this check gets wrong:

| Input | `startsWith('javascript:')` | This guard | Why |
|---|---|---|---|
| `JaVaScRiPt:alert(1)` | passes | **refused** | the scheme is case-insensitive |
| `java\tscript:alert(1)` | passes | **refused** | tabs and newlines are removed *before* parsing |
| `\0javascript:alert(1)` | passes | **refused** | leading control characters are stripped |
| `%6a%61%76%61script:x` | refused | **allowed** | it is a *path*; the browser agrees |

The last row is the one that matters most: over-refusing a legitimate relative path is a bug too,
and only the parser knows which is which.

**2. It answers; it does not throw.** A refusal is `null`. A builder rendering fifty records cannot
let one hostile field discard the other forty-nine, and a security check that throws on hostile
input has moved the failure rather than removed it. Only a malformed **option** throws (ADR-0047):
the input is the attacker's, the options are the caller's. The suite property-tests totality —
a string or `null`, never an exception, for any input.

Two refusals are worth naming because they are not about schemes at all. A **non-string** is
refused rather than coerced, since `String({})` is `'[object Object]'`, which parses as a relative
path and would be *allowed*. The **empty string** is refused explicitly, because resolved against
any base it *is* that base — a guard reading only the parsed protocol would have called it `https:`
— and as an `href` it means "this page", which is a different lie from no link at all.

**3. The allow-list is context-dependent, and the context lives at the call site.** The default —
`http:`, `https:`, `mailto:`, `tel:` and relative references — is what an `href` may be. `data:`
and `blob:` are deliberately absent from it and passed by the **two image call sites**, because
`data:text/html` in an `href` is a script and the same value in an `<img src>` is an inert picture.
A caller extends the set through one option, `protocols`, threaded through `commonOptions` — the
shared builder contract that already carries `{html, sanitize}`, which is the same kind of thing: a
policy about untrusted values. One name for five builders, not five bespoke options.

**4. A refusal leaves the element, drops the attribute, and says so.** No `href=""` (a link to the
current page), no missing row: the element keeps its label, its `alt`, its position, and gains
`data-egl-refused-url`. The marker carries **no value** — the refused string is attacker-controlled
and there is no reason to put it back into the document — and it is what makes a refusal *findable*
instead of looking like a builder bug.

**5. The public export lands on `/sanitize`, and the measurement is why it could.** Spec 09 NFR-46
required measuring before choosing, and the two obvious homes were eliminated by arithmetic: the
root has **147 B** free under ADR-0053's 6.25 kB clause and `/text` has **26 B** under NFR-08's
1 kB clause, against a guard that costs **247 B**. `/sanitize` had no clause figure, so its limit
is a derived pin that can move — and the charter is why it is *right* rather than merely available:
`sanitizeHtml` decides which tags and attributes an untrusted string may carry, and `safeUrl`
decides which schemes an untrusted URL may carry. The builders reach an **internal module**, never
the entry, so nothing couples `/bootstrap` to `/sanitize` and ADR-0030 is untouched.

**6. The guard is split, and both halves were measured.** The builders use the parse half
(`protocolOf` + the default set); `safeUrl` adds the option validation. That split was measured
twice, because the first measurement made it look pointless:

| | `/bootstrap` | five per-function rows |
|---|---:|---|
| one function, validated everywhere | 25 003 B — **3 B over** ADR-0041's clause | +371 to +396 B each |
| split (shipped) | 24 902 B | +212 to +252 B each |
| saving | 101 B | **~150 B each** |

Judged on the entry alone the split buys 101 B and is not worth a second code path. Judged on the
five rows it buys ~750 B more, and those rows are what a consumer of one builder actually pays. The
cost is a real inconsistency, recorded rather than hidden: a builder's own malformed `protocols`
**fails closed** — it cannot widen the set, and the refusal shows through the marker — while
`safeUrl` throws for the caller who calls it directly. Fail-closed-and-observable is a defensible
security posture; fail-closed-and-silent would not have been, which is what the marker earns.

**7. ADR-0041's 25 kB `/bootstrap` clause is amended to 25.5 kB.** There was no version of this
item that fitted: the honest single-function routing measured 3 B *over*, and the split landed
98 B under — which is not a margin to ship on, as ADR-0082 spent a whole item establishing. The
clause moves by the minimum that restores the margin the row actually had (368 B at 24 632 B), and
the row is pinned at 25.4 kB. What the clause was sized to prevent is the **catalogue sprawling**;
a security control applied to components that already exist is not sprawl. ADR-0079 refused to
raise this clause for a convenience wrapper, and that refusal is why raising it here is affordable.

## Alternatives Considered

| Option | Why not |
|---|---|
| **A blocklist of dangerous schemes** (`javascript:`, `data:`, `vbscript:`) | Wrong in both directions: it misses `java\tscript:` and a case variant, and it refuses `%6a…script:` which is a legitimate path. A parser already knows the answer. |
| **Throw on a refused URL** | A list of fifty records would lose forty-nine rows to one hostile field. The caller who wants an exception writes `?? raise()`. |
| **Coerce a non-string with `String(value)`** | `'[object Object]'` is a relative path, so a programming error would have rendered a link instead of being refused. |
| **`data:` in the default allow-list** | `data:text/html` in an `href` is a script. The two contexts differ, so the two call sites that need it say so. |
| **`href="#"` or `href=""` for a refusal** | Both are links. `#` is "the top of this page" (and is what a nav item with *no* href has always rendered, which must stay distinguishable); `""` is "this page". An absent attribute is the only spelling of "no link". |
| **Put the guard on the root or `/text`** | Measured: 147 B and 26 B of clause headroom respectively, against 247 B. Either would have needed a clause amendment to a *utility* entry to hold a *security* primitive. |
| **Fold it into `sanitizeHtml`'s options** | Would make `/bootstrap` depend on a peer-bearing entry for a `Set` lookup, and conflate two decisions with different failure modes. |
| **One function everywhere, and amend the clause further** | Costs ~150 B on each of five per-function rows for a validation the builders never reach. The inconsistency the split introduces is bounded, observable and recorded; 750 B of dead code on the rows a consumer pays is not. |
| **Validate `protocols` in `commonOptions` to close the inconsistency** | Puts the validation strings back into `/bootstrap` and into all five rows — the exact bytes the split bought — to convert a fail-closed refusal into a throw. |

## Consequences

- **`/sanitize` reaches 1 738 B** (+247 B) and `safeUrl` alone measures **651 B**;
  **`/bootstrap` reaches 24 902 B** (+270 B) under an amended 25.5 kB clause. The five per-function
  rows for the builders that render a URL each grew ~220 B and are re-pinned at their own margins —
  every one of them caught by `check:size-figures`, which is ADR-0082's gate doing its job on the
  very next item.
- **F87 priced the new chunk, and it is the largest gap this accounting has shown**: `url-guard.js`
  became its own shared chunk, so `/sanitize` grew **+724 B and a fourth request**, `/bootstrap`
  **+1 051 B and a thirteenth**, and `/ui` **+913 B and an eleventh — for a guard it never calls**,
  because it composes `/bootstrap` internals. A bundler consumer of `/sanitize` pays 247 B for the
  same code. One change, three routes, and only this table can see the second number (ADR-0061).
- **NFR-22's derived clause re-derives to 71 kB** (70 546 B), exactly as 21.5 predicted when it
  landed 20 B under 70 kB.
- **The surface is additive**: 140 exports become 141. `ContentOptions` gains an optional
  `protocols`, and `BsTableColumn` is untouched.
- **The threat model changes in this PR**: the "Rendered record data" boundary's Tampering and
  Elevation-of-privilege cells now name the URL control, and the guard has its own row. That was
  spec 09 NFR-48's condition and AGENTS.md §7's trigger.
- **A behaviour change, small and deliberate**: an application that today renders a `data:` image
  through `bsCard` keeps working (the call site allows it), and one that renders a `javascript:`
  link stops — which is the point. Anything else legitimate that a default of four protocols
  refuses is one `protocols` option away, and the marker attribute is how a developer finds it.

## References

- `src/main/javascript/it/d4np/utils/url-guard.js`,
  `src/main/javascript/it/d4np/utils/bootstrap-elements.js` (`setSafeUrl`),
  `src/test/javascript/it/d4np/utils/url-guard.test.js`,
  `src/test/javascript/it/d4np/utils/url-guard-builders.test.js`
- [`docs/security/threat-model.md`](../security/threat-model.md) — the boundary and its STRIDE pass
- [spec 09](../specs/09_spec_hardening.md) §2 F126-F127, §3 NFR-46/NFR-47/NFR-48, §6

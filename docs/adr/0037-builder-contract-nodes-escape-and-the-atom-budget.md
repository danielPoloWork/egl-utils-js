# ADR-0037: The builder contract — nodes over strings, escaping by construction, and what an atom costs

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F52-F60, §3 NFR-17/NFR-19/NFR-20/NFR-21](../specs/04_spec_bootstrap_toolkit.md),
  ROADMAP 14.1, [ADR-0031](0031-component-instances-and-the-alert-budget.md) (the component
  contract this layer composes), [ADR-0030](0030-sanitize-is-a-required-parameter.md) and
  [ADR-0012](0012-sanitize-default-profile.md) (the `{html, sanitize}` pair and the
  optional-peer precedent), [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md)
  (fail-fast DOM contract), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md),
  [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) and
  [ADR-0035](0035-the-controls-bridge-and-the-dom-budget.md) (measure, then amend the budget
  with a named row)

## Context

Spec 04 commits to a manager for every Bootstrap 5 component. Thirty-odd builders written
one at a time will diverge unless the first PR fixes the contract they all copy — that is
the whole reason 14.1 exists as a milestone item rather than as a batch of small functions.

Three forces set the contract.

**The defect being replaced is string interpolation.** The prevailing way to produce
Bootstrap markup from data is a template literal — `` `<span class="badge">${value}</span>` ``
assigned to `innerHTML`. It is compact, it reads well, and it is an injection every time a
field turns out to be attacker-influenced, because a template literal has no way to tell
data from syntax. The audit that motivated this wave found that shape at scale, with record
values interpolated unescaped into table cells and dialog bodies. A toolkit that replaced it
with the same shape behind a nicer name would have moved the defect, not removed it.

**Every builder needs the same three guarantees**, and they are obligations of the spec, not
conveniences: a resolvable document with a typed failure when there is none (NFR-20), class
tokens that cannot become a platform `DOMException` (NFR-19's neighbour — a malformed
variant must name the option), and an ARIA surface with no human-readable string baked in
(NFR-21). Written once they are a shared floor; written per builder they are thirty chances
to forget one.

**That floor has a measured cost**, and it collides with a budget clause written before the
contract existed. Spec 04 NFR-17 inherited "pure atom builders keep the 1 kB single-import
clause" from specs 01–02, where a plain function is genuinely tiny (`isIpv4` is 195 B,
`truncate` 375 B). It was an estimate made before anything was built — the same situation
ADR-0031, ADR-0034 and ADR-0035 each resolved by measuring first.

## Decision

**1. Builders return nodes, and caller data reaches the DOM only as data.** Every builder
creates real elements and writes content with `textContent` / `setAttribute`. No builder
concatenates caller data into markup, so escaping is not a discipline anyone has to
remember — it is the only path available. Markup requires the explicit
`{ html: true, sanitize }` pair, `sanitize` being a function or the literal `false` as a
signed trusted-content declaration, identical to F47 (ADR-0030) and F49 (ADR-0031). There is
no default sanitizer: one would silently bind this entry to the DOMPurify optional peer that
ADR-0012 deliberately keeps optional.

**2. The document is an option, not only an ambient global.** `resolveDocument` takes
`options.document` and falls back to the ambient one, failing with `DomContractError` when
neither exists. This *extends* F52 as frozen (see the amendment below): the clause said
nodes are created "in the target's own document", which an atom builder has no target to
read. Without the option, `bsBadge('New')` is unusable in an iframe, a popup, or a
server-side DOM implementation — NFR-20 would be satisfiable only in its diagnostic
direction, never in its working one.

**3. A class token that cannot be a class is a `TypeError`, not a `DOMException`.** Variants,
sizes and icon names land in class names, and `classList.add` throws
`InvalidCharacterError` — a platform error naming neither the option nor the caller — for
whitespace or an empty string. Tokens are therefore validated first, and the caller's
`class` option is *split* on whitespace rather than rejected, because `'mt-2 me-1'` is how
everyone writes classes. Variants are **not** checked against a fixed list: a custom
`$theme-colors` entry is a legitimate variant and the library cannot know a project's
palette.

**4. An icon set is data, and `bsIcon` is its adapter.** Two conventions cover the field —
a class per icon name, or one class plus a ligature — so both ship as frozen data presets
and neither is privileged by being hardcoded. Anything else supplies `render`. No icon font
is bundled, imported, or assumed loaded.

**5. A control without an accessible name is refused.** An icon-only button, or a
`role="group"` with no label, is announced as an unnamed control and is indistinguishable
from every other one on the page. Since the fix is one option, the builder throws rather
than warning: a console warning ships the broken control. This is NFR-21 as a hard gate.

**6. Budgets, measured.** Amend spec 04 NFR-17:

- The atom-builder clause moves from **1 kB to 1.2 kB**. Justification is the floor, not
  slack: `bsCloseButton` — the simplest builder that touches document resolution, token
  validation and the ARIA surface — measures **813 B**, so roughly four fifths of the old
  clause is contract that NFR-19/NFR-20/NFR-21 require, leaving ~200 B for a builder's own
  markup. Five of the eight atoms fit 1 kB anyway (813–895 B); three sit just past it
  (`bsPlaceholder` 1005 B, `bsBadge` 1014 B, `bsProgress` 1101 B).
- **`bsButton` takes a named composing row at 1.85 kB** (measured 1688 B). It composes
  `bsIcon` — because F55 accepts an icon *name*, which is the ergonomic point of the option
  — plus the visually-hidden naming path and listener teardown. NFR-17 already exempts
  composing facades and names `bsTable`; `bsButton` is the same shape at a smaller scale,
  and the exemption is extended to it explicitly rather than by reading.
- Every row is pinned at its measured size plus ≈7%, with the figure in the row name, per
  the ADR-0015 convention.

## Alternatives Considered

- **Return HTML strings and sanitize at the boundary.** Rejected: it keeps the shape whose
  failure mode this wave exists to remove, and it makes correctness depend on every call
  site remembering the sanitizer. Nodes make the safe path the only path, and cost nothing
  at runtime.
- **A default sanitizer for `{ html: true }`.** Rejected: it would make `/bootstrap` depend
  on the DOMPurify optional peer, contradicting ADR-0012, and it would let markup rendering
  happen without anyone deciding it should.
- **Trim the error messages to fit the 1 kB clause.** Rejected explicitly. The three
  offending builders are over by 5, 14 and 101 B, and the cheapest bytes to recover are the
  message strings that make a `TypeError` actionable — which is itself a documented contract
  property. Deleting a real obligation to protect an estimate is the inversion ADR-0031
  warned about; the clause moves instead.
- **Validate variants against Bootstrap's eight theme colours.** Rejected: it would break
  every project with a custom `$theme-colors` entry, and it buys nothing — the token check
  already prevents the only mechanical hazard.
- **A fluent builder (`bsCard().header(x).body(y).build()`).** Rejected: options objects are
  the house call shape, a chain cannot validate its arguments until `build()`, and every
  intermediate method is public surface SemVer must protect. Recorded in the patterns
  catalogue's Rejected table.
- **Let `bsButton` accept only a pre-built icon node**, keeping it under 1 kB. Rejected: it
  pushes `bsIcon('plus-lg')` into every call site to save bytes in a scenario nobody
  measures, and F55 specifies the icon *name* shape.

## Consequences

- Thirty-odd managers now have one contract to copy, and one place to change it. 14.2's
  composites and M15's `bsTable` inherit escaping, class handling, document resolution and
  teardown rather than re-deciding them.
- The escape promise is verified by attack, not by review: the roadmap 6.5 bypass corpus is
  pushed through every content-accepting option of every builder and asserted inert,
  including a re-parse of `outerHTML` that closes the serialize-then-reparse class those
  payloads come from.
- `/bootstrap` measures **2943 B** for all eight atoms plus both presets, against the
  entry's 15 kB clause — the behaviour wrappers and `bsTable` have room.
- Sharing `dom-helpers.js` between `/dom` and `/bootstrap` makes tsup extract it into a
  common chunk, which costs `/dom` **8 B** (4718 → 4726 B, inside its unchanged 5 kB
  clause) and avoids duplicating the helpers into both entries. Recorded because a budget
  that moves for a build-graph reason, not a code reason, is exactly the kind of drift a
  future reader will otherwise mis-attribute.
- Consumers still supply Bootstrap's CSS and any icon font. This toolkit emits markup and
  class names only, and the zero-runtime-dependency gate is untouched: nothing in 14.1
  references the `bootstrap` peer, so the builders work with no peer installed and no
  global loaded.

## References

- [spec 04 §2 F52-F60](../specs/04_spec_bootstrap_toolkit.md) — the builder clauses, with
  the F52 `document` and F59 `format` amendments this ADR justifies
- [spec 04 §3 NFR-17/NFR-19/NFR-20/NFR-21](../specs/04_spec_bootstrap_toolkit.md) — budgets,
  escaping, Node-safety, accessibility
- [ADR-0030](0030-sanitize-is-a-required-parameter.md) — where the `{html, sanitize}` pair
  was first fixed
- [ADR-0031](0031-component-instances-and-the-alert-budget.md) — measure, then amend, and
  never delete an obligation to protect an estimate
- `src/main/javascript/it/d4np/utils/bootstrap-elements.js` — the contract and the eight atoms
- `src/test/javascript/it/d4np/utils/bootstrap-escape.test.js` — NFR-19 by adversarial corpus

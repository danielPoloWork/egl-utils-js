# ADR-0038: Composites compose — the close control is not an icon, and what a frozen constant costs

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Daniel Polo
- **Related:** [spec 04 §2 F61-F65, §3 NFR-17/NFR-19/NFR-21](../specs/04_spec_bootstrap_toolkit.md),
  ROADMAP 14.2, [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the
  builder contract these inherit), [ADR-0031](0031-component-instances-and-the-alert-budget.md)
  (the F49 alert engine `bsAlert` composes, amended here),
  [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) (the F42 read model
  `bsPagination` speaks), [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md)
  (delegation and structural teardown), [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md)
  (measure, then amend the budget with a named row)

## Context

14.1 fixed the contract every Bootstrap builder copies. 14.2 is the first wave to *use* it
for components that are assembled rather than drawn, and three questions only appear at
that point.

**What does "composed, not reimplemented" cost in practice?** Spec 04 promises that
`bsAlert` is the F49 engine in Bootstrap's costume and that `bsPagination` speaks the read
model F42 already returns. Those are architectural claims, and the moment the code exists
they become questions with measurable answers: does the engine actually fit a design
system it was not written for, and does the read model actually need no adapter?

**A composite is where a nested instance becomes possible.** Bootstrap encourages a list
group inside a card inside a list-group item. Two instances of the same component, nested,
sharing one marker attribute, is a case an atom never faces.

**Estimated budgets meet reality again.** NFR-17's per-component ceilings were written
before any builder existed — `bsBreadcrumb ≤ 0.75 kB`, for instance — and ADR-0037 has
since measured the shared contract those numbers were supposed to accommodate.

## Decision

**1. The close control is a control, not an icon slot — F49 amended.** `inlineAlert`
hides an icon slot whose content is empty, which is right for a decorative span beside a
message and wrong for the dismiss button, where the slot *is* the control. Bootstrap's
`.btn-close` draws its glyph entirely in CSS, so the correct icon for it is empty — and
that hid the only way to dismiss the alert. `renderIcon` now takes `hideWhenEmpty`, false
for the close button. `dismissible: false` remains how a caller asks for no button; an
empty glyph asks for no *glyph*. Verified before it was believed: a probe confirmed
`hidden=""` on the rendered button.

**2. Composition is literal.** `bsAlert` returns `inlineAlert` configured with a frozen
Bootstrap class map and nothing else — no re-implemented timer, escaping, ARIA role or
teardown. `bsPagination.update()` accepts `{page, pageCount}`, which is a subset of
`view()`, so `table.on('change', pager.update)` needs no adapter. The consequence worth
stating: a fix to either engine reaches both entries at once, and the two cannot drift.

**3. F49's kind vocabulary stays frozen; the costume varies.** F64 asks for "Bootstrap's
full variant range", which could have meant widening F49's four kinds to Bootstrap's
eight. It does not: the injected class map already reaches any variant
(`{ classes: { info: 'alert-primary' } }`), and widening a frozen contract for a naming
convenience would have made the alert engine know about a design system.

**4. Delegation is scoped to direct children.** A nested list group carries the same
`data-egl-index` marker, and `closest()` walks past it to whichever ancestor matches
first — handing the outer handler the *inner* list's index to look up in the *outer*
list's array. That is a wrong record, silently, or none. The match must therefore be a
direct child of the instance's own root. Found by chasing an uncovered branch rather than
by review, which is the argument for chasing them.

**5. Accessible names get English defaults; visible marks get glyphs.** NFR-21 requires
every human-readable string to be injectable, and F51 established language-neutral
defaults. A *name* cannot be language-neutral — `aria-label="›"` announces nothing — so
`bsPagination` defaults `nav`/`previous`/`next` to English words and makes them
injectable, while `previousText`/`nextText`/`ellipsis` default to glyphs. This is the F57
`closeLabel: 'Close'` precedent, stated as a rule rather than repeated as an exception.

**6. `Object.freeze` at module scope is not tree-shakeable without help.** A frozen
constant is a *function call*, so a bundler must assume it may have side effects and keeps
it in every bundle that touches the module — including consumers who import nothing near
it. Measured: importing only `bootstrapIconsSet` retained `materialIconsSet` **and** the
Bootstrap alert class map, 358 B for what should be one frozen literal. Annotating the
calls `/* @__PURE__ */` brings it to **92 B**, and makes every atom smaller than it was in
14.1 despite the entry gaining five components. Every frozen constant in this entry is
annotated, and any added by M15/M16 must be — thirty more class maps would otherwise tax
every single import in the toolkit.

**7. Budgets, measured.** Amend spec 04 NFR-17's indicative per-component ceilings:

- `bsBreadcrumb` **0.75 kB → 1.3 kB** (measured 1184 B). The old number was *below the
  shared contract floor*: `bsCloseButton`, the thinnest builder that still resolves a
  document, validates class tokens and sets an ARIA surface, measures **763 B**. No
  builder of any kind could have met 0.75 kB, which is the clearest possible evidence that
  the pre-implementation numbers were guesses about a contract that did not yet exist.
- `bsCard` **1.25 kB → 1.5 kB** (measured 1418 B).
- `bsListGroup` **1.25 kB → 2.15 kB** (measured 2006 B), and it becomes a **named
  composing row**: it composes `bsBadge` for item badges and owns a delegated listener,
  the same shape `bsButton` has for composing `bsIcon`.
- `bsAlert` (≤ 2 kB, measured 1521 B) and `bsPagination` (≤ 1.5 kB, measured 1406 B) held
  their ceilings and are pinned at measured + ≈7%.
- The entry moves 3.15 kB → **6.63 kB** (measured 6195 B) against its unchanged 15 kB
  clause.

## Alternatives Considered

- **Reimplement the alert in Bootstrap terms** instead of composing F49. Rejected: it
  would duplicate the timer, the escaping rule, the ARIA split and the teardown — four
  behaviours that are already tested once — and guarantee they drift.
- **Widen F49's kinds to Bootstrap's eight variants.** Rejected: it changes a frozen
  contract so that the framework-agnostic component knows a framework's palette. The
  class map already reaches every variant.
- **Give `bsPagination` an adapter for the pipeline's view.** Rejected as unnecessary:
  `update({page, pageCount})` is satisfied by `view()` directly. An adapter would exist
  only to be written about.
- **Keep the delegation match unscoped and filter by index range.** Rejected: it happens
  to work only while the outer list is shorter than the inner one, which is a coincidence,
  not a rule. Scoping to direct children is exact.
- **Drop `Object.freeze` to make the constants shakeable.** Rejected: the immutability is
  the point of a shared data preset, and a test asserts it. `/* @__PURE__ */` keeps both.
- **Move the alert class map inside `bsAlert`** so it is only retained with the function.
  Rejected once the annotation solved it generally: the fix has to work for thirty
  constants, not one.
- **A single `bootstrap-elements.js` holding F52–F65**, as spec 04 §4 diagrams. Rejected
  in favour of a sibling `bootstrap-composites.js` behind the same entry — the precedent
  `/dom` set when spec 03 §4 listed three files and 11.2/11.3 shipped five. The entry
  stays single, the files stay readable, and the shared internals are imported rather than
  copied, which is what keeps the contract one implementation.

## Consequences

- The `/bootstrap` entry now carries 13 builders in 6195 B against a 15 kB clause, so
  `bsTable` (M15) and the behaviour wrappers (M16) have room.
- The F49 fix reaches `/dom` as well: any consumer whose design system draws its own close
  glyph now gets a working dismiss button. The old behaviour was a defect, not a feature —
  hiding the button was never how a caller asked for no button.
- The `/* @__PURE__ */` rule is now a standing obligation for this wave, and its absence is
  the kind of regression only a per-import size row would catch. The
  `single: bootstrapIconsSet` row exists precisely to keep catching it.
- `bsListGroup` and `bsPagination` are the first `/bootstrap` components that own
  listeners, so NFR-15 applies to them: `destroy()` and an aborted signal each detach the
  delegated listener and remove the element, asserted rather than assumed.
- One limitation recorded rather than papered over: a listener-owning component built into
  a *foreign* document from Node hits jsdom's rejection of a cross-realm `AbortSignal`,
  which browsers accept. The Node-safety suite therefore exercises the non-interactive
  builders in an isolated document and the interactive ones in the ambient one. No
  workaround was added, because the constraint is jsdom's rather than the library's.

## References

- [spec 04 §2 F61-F65](../specs/04_spec_bootstrap_toolkit.md) — the composite clauses
- [spec 03 §2 F49](../specs/03_spec_dom_ui_table.md) — the alert engine, amended here
- [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) — the contract and
  the atom budget these inherit
- `src/main/javascript/it/d4np/utils/bootstrap-composites.js` — the five composites
- `src/test/javascript/it/d4np/utils/bootstrap-composites.test.js` — including the nested
  list-group case and the close-control regression

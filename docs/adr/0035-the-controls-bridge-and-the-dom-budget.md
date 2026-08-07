# ADR-0035: The controls bridge — one-way inputs, injected wording, and what /dom costs

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Daniel Polo
- **Related:** [spec 03 §2 F51, §3 NFR-12/NFR-15](../specs/03_spec_dom_ui_table.md),
  ROADMAP 13.2, [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) (the
  pipeline this binds), [ADR-0029](0029-delegation-teardown-and-setter-symmetry.md) (delegation
  and structural teardown), [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md)
  (fail-fast DOM contract), [ADR-0031](0031-component-instances-and-the-alert-budget.md)
  and [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure, then
  amend the budget with a named row)

## Context

`tablePipeline` (F42) derives state and touches no document; `/dom` attaches listeners and
writes attributes. F51 is the **only** bridge between them, and it is the last item of the
tabular wave. Building it forced four decisions the pre-implementation clause had left
open, and produced one measurement that broke a budget.

## Decision

**The binding speaks to the pipeline only through public commands and `'change'`.** It
holds no state of its own — the current page for a *next* click is read back from
`pipeline.view()`, not remembered. That is what lets the same pipeline instance be derived
during a server render and adopted afterwards by a browser that attaches this binding: the
pipeline never learns a binding exists.

**Reflection is one-way for text inputs.** Sort headers receive `aria-sort` and pagination
controls are enabled or disabled from every derived view, but filter and search inputs are
never written back. A control that rewrites the field its user is typing in fights its own
user — cursor position, composition sessions and IME state are all casualties.

**The pagination wording is injected; the default has no words.** `formatStatus(view)`
defaults to `'1 / 4'` — digits and a separator. A default of "Page 1 of 4" would ship an
English string into every consumer's interface, which is the hardcoded-policy failure this
whole wave was written to avoid.

**A selector that matches nothing throws**, naming every miss in one `DomContractError`.
Passing a selector is an assertion that the control exists; a typo that silently disables a
filter box is exactly the defect `bindElements({strict})` exists to catch. Controls a table
genuinely lacks are omitted from `bindings` rather than pointed at a missing node.

**Headers are re-queried on every reflection, and clicked through one delegated listener.**
The caller owns rendering and may replace the whole `thead`; a captured node list would
silently stop receiving `aria-sort`, and per-header listeners would simply be gone.

**`/dom`'s budget is amended to 5 kB, and `bindTableControls`' row pinned at 2.2 kB.**
Measured: entry 4718 B (from 3436 B), `{ bindTableControls }` 2093 B.

## Alternatives Considered

- **A private debounce inside the binding, to keep `/dom` under 4 kB** — rejected. The F7
  `debounce` is a shipped, tested primitive with `cancel` semantics this binding depends on
  for NFR-15; re-implementing a subset to protect a byte estimate is the inversion of
  ADR-0031's lesson, and the duplicate would drift.
- **Writing filter values back into their inputs on `'change'`** — rejected as above; it
  also creates a feedback loop with the debounce, where a reflected write re-triggers the
  handler that produced it.
- **A default status string with words** (`Page 1 of 4`) — rejected: untranslatable and
  presumptuous. Callers who want words pass three lines of `formatStatus`.
- **Skipping selectors that match nothing** — rejected: it converts a typo into a control
  that looks bound and does nothing, discoverable only by a user reporting that filtering
  "does not work".
- **Capturing the header elements once at bind time** — rejected: correct only until the
  first re-render, and re-rendering is the normal case for a table.
- **Letting the binding render rows too** — rejected, and the reason the F51 clause says so
  explicitly: cell markup is application design. The binding wires controls; rows are the
  caller's, attached with one `delegate` listener that survives re-renders.
- **Storing the current page in the binding** — rejected: a second copy of state that can
  disagree with the pipeline is the very defect ADR-0034 removed one layer down.
- **Trimming diagnostics to stay under 4 kB** — considered and refused. The bind-time
  command check and the missing-selector report are the fail-fast posture the whole entry
  is built on; removing them to protect an estimate written before the contract existed is
  what ADR-0031 warned against.

## Consequences

- Teardown is structural and complete (NFR-15): one internal `AbortController` detaches
  every listener, the pipeline subscription is dropped, and every in-flight debounce is
  cancelled, so no trailing keystroke can command a pipeline the binding no longer
  reflects. An aborted caller signal does the same, and an already-aborted one binds
  nothing.
- `/dom` costs 4718 B fully imported — the increase is F51's own code plus the F7 debounce
  it pulls onto the entry. A consumer importing only `{ bindElements }` still pays 1 kB or
  less; the per-import scenario rows are what keep that honest.
- The wave's browser gap is closed here: 13.2 adds the F51 end-to-end scenario **and** the
  F50 focus save/blur/restore case that 12.2 owed, since real focus traversal is precisely
  what jsdom cannot establish.
- `formatStatus` is a new public option not in the pre-implementation clause; spec 03 F51 is
  amended in the same PR rather than the implementation diverging silently.

## References

- [`src/main/javascript/it/d4np/utils/dom-table.js`](../../src/main/javascript/it/d4np/utils/dom-table.js) — the binding
- [`src/test/javascript/it/d4np/utils/bind-table-controls.test.js`](../../src/test/javascript/it/d4np/utils/bind-table-controls.test.js) — jsdom behaviour and teardown
- [`src/test/browser/smoke.spec.js`](../../src/test/browser/smoke.spec.js) — the real-engine scenario, and F50's focus restoration

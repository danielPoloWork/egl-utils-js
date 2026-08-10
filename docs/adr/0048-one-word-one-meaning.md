# ADR-0048: One word, one meaning — the vocabulary v1.0.0 freezes

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 17.8, filed by the
  [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.2–§2.4 and §4;
  [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) (**the prerequisite** — without
  it every rename below would fail silently),
  [ADR-0031](0031-component-instances-and-the-alert-budget.md) (the F49 alert engine whose
  `autoHideMs` becomes the library's word),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md) (`bsAlert` as the
  engine in a costume — the reason the engine's vocabulary wins),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) and
  [ADR-0044](0044-a-second-peer-one-sanitizer-and-a-catalogue-closed.md) (why a wrapper
  mirrors the vendor's method names),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md) (the shared builder
  contract), spec 04 F53/F56–F59/F62/F63/F65/F69 amended here

## Context

The 17.1 review read the 110-export surface side by side for the first time and found the
same word doing different jobs on sibling APIs. Three findings, one shape:

**`label` meant two things.** The accessible name in six builders (`bsIcon`,
`bsButtonGroup`, `bsCloseButton`, `bsSpinner`, `bsProgress`, `bsBreadcrumb`) and the visible
text in two (`bsButton`, `BsTableColumn`). Both readings are defensible alone; together they
are a coin flip inside one import:

```js
bsButton({ label: 'Save' });        // 'Save' is on screen
bsCloseButton({ label: 'Save' });   // 'Save' is only in the accessibility tree
```

**Auto-dismiss had two vocabularies.** `autoHideMs` on the alerts, `autohide` + `delay` on
`bsToast` — one capital and one suffix apart, in the same entry.

**`update()` meant three things.** Re-render from data in three components
(`bsListGroup`, `bsPagination`, `bsProgress`), reposition in two (`bsTooltip`/`bsPopover`,
and a navbar's dropdowns) — while the largest data component in the library called the same
job `setData()`.

Two further things the review found *already* consistent and unwritten: the `Ms` unit suffix
(carried by `autoHideMs`/`minVisibleMs`/`debounceMs`, absent from
`delay`/`interval`/`timeout`/`maxWait`) and the callback argument order (data first with the
event last, except on DOM primitives where the event comes first). A convention nobody wrote
down is a coincidence waiting to be broken by the next contributor.

All of it is MAJOR-protected after 1.0, so this is the last cheap moment — and it is only
*safe* now because [ADR-0047](0047-an-unknown-option-key-is-a-typeerror.md) landed first. On
the previous release, `bsIcon({ label })` after a rename would have silently produced an
unnamed icon. Today it is a `TypeError` naming the key.

## Decision

### 1. `label` is what the user sees; `ariaLabel` is the accessible name

Renamed to `ariaLabel`: **`bsIcon`, `bsButtonGroup`, `bsCloseButton`, `bsSpinner`,
`bsProgress`, `bsBreadcrumb`** — and `IconSpec.ariaLabel`, which is forwarded straight to
`bsIcon`.

Unchanged: **`bsButton.label`** (visible text, beside the `ariaLabel` it already had) and
**`BsTableColumn.label`** (the visible header).

Chosen this direction, and not the other, for two reasons. It matches the platform — HTML's
`<label>` is visible and `aria-label` is explicitly the invisible variant — and it matches
where the traffic is: the six renamed options all have sensible defaults or serve
localisation, so they are rarely passed, while `bsButton.label` is the most-typed option in
the toolkit. Renaming the six moves the churn to the options a caller touches least.

`bsSpinner.ariaLabel` is delivered as visually-hidden text rather than an attribute, which is
Bootstrap's own shape for a spinner. The option's contract is *the accessible name*; the
delivery is ours to choose. That is the point of naming the intent rather than the mechanism.

**Sub-parts keep `<part>Label`** — `closeLabel`, `togglerLabel`, `spinnerLabel`,
`controls.search.label`. Nothing is renamed there, and the boundary is deliberate: the
top-level ambiguity was *demonstrated* (6-vs-2 on one word), while a sub-part's ambiguity is
hypothetical — a `.btn-close` draws its glyph in CSS, so there is no visible text for
`closeLabel` to be confused with. Where a part ever grows both, the visible one is
`<part>Label` and the accessible one `<part>AriaLabel`. A `labels` **map** stays the shape
for a component with several named strings (`bsPagination`, `bsCarousel`), where an entry is
an accessible name unless its key ends in `Text` (`previousText`, `nextText`) — which is
already true and is now the rule.

### 2. One auto-dismiss option: `autoHideMs`

`bsToast` takes **`autoHideMs: number | false`** — at the manager and per `show()` — instead
of Bootstrap's `{autohide, delay}` pair. `false` means "stay up until dismissed"; the default
stays Bootstrap's 5000 ms, because a toast is transient by nature where an inline alert is
not. Bootstrap's pair still exists, translated at the one place it belongs: the config handed
to its constructor.

The engine's word wins over the vendor's because ADR-0038 already settled the direction of
composition — `bsAlert` *is* the F49 engine in a costume — and because `/dom`'s `inlineAlert`
cannot borrow Bootstrap vocabulary without importing a design system's naming into an entry
that has no Bootstrap dependency.

### 3. `set<Noun>(value)` takes new state; a bare `update()` recomputes

| Was | Is | Why |
|---|---|---|
| `bsListGroup(...).update(items)` | **`setData(items)`** | a collection, like `bsTable.setData(rows)` |
| `bsProgress(...).update(value)` | **`setValue(value)`** | a scalar |
| `bsPagination(...).update(view)` | **`setView(view)`** | a read model — the word `TableView` and `formatStatus(view)` already use |
| `bsTooltip`/`bsPopover`/dropdown `.update()` | **unchanged** | no argument: recompute from what you have |
| `bsScrollspy(...).refresh()` | **unchanged** | same, under the vendor's own name |
| `bsTable(...).setData(rows)` | **unchanged** | already the rule's exemplar |

**A no-argument recompute keeps the vendor's name.** Bootstrap and Popper both call it
`update`; Bootstrap's ScrollSpy calls its own `refresh`. A wrapper that renamed either would
make the vendor's documentation wrong about our surface — the opposite of what a wrapper is
for. Two names for one idea, both inherited, is the smaller cost.

### 4. The `Ms` suffix rule — no rename, one sentence

**A duration carries the `Ms` suffix unless its name is already a duration.** `delay`,
`interval`, `timeout`, `maxWait`, `minDelay`, `maxDelay` are nouns that can only be lengths
of time. `autoHide`, `minVisible`, `debounce` are a behaviour, a state and a technique — a
bare number beside them says nothing, so they carry the unit.

The rule explains the entire existing surface without moving a single option, and it is why
§2 above chose `autoHideMs` rather than `autoHide`.

### 5. Callbacks: `on<Event>`, data first, event last

- **`on<Event>`** names the event, not the noun: `onClick`, `onSelect`, `onRowClick`,
  `onShow`, `onHide`, `onAttempt`. One violation existed and is renamed —
  **`bsPagination.onPage` → `onPageChange`**.
- **A data-carrying callback takes the event last**: `onSelect(item, index, event)`,
  `onRowClick(row, event)`. Everything the caller reasons about comes first; the event is the
  provenance.
- **A DOM primitive takes the event first**: `delegate`'s `handler(event, matchedElement)`.
  It has no domain data, and event-first is the idiom of the API it stands in for.

## Alternatives Considered

- **`label` = accessible name everywhere**, renaming `bsButton.label` → `text` and
  `BsTableColumn.label` → `header`. Two renames instead of six, but it inverts the platform's
  meaning of `label`, breaks the most-typed option in the toolkit, and leaves `labelHidden`
  referring to an option no longer called `label`. Rejected.
- **Keep both `label` senses and document them per option.** Rejected: that is exactly the
  state the review criticised — every individual option is documented already, and the reader
  still cannot tell without checking.
- **Rename `<part>Label` to `<part>AriaLabel` for consistency.** Rejected as
  disproportionate: `closeAriaLabel` is uglier, three more breaking renames, and no
  demonstrated ambiguity to fix. Recorded here so the next contributor sees a decision rather
  than an oversight.
- **`autohide`/`delay` everywhere**, adopting Bootstrap's pair on the alerts. Rejected:
  `inlineAlert` lives on `/dom` and has no Bootstrap dependency to justify its vocabulary.
- **`reposition()` for the no-argument sense**, freeing `update()` for data. Rejected: it
  breaks the vendor mirror the peer-backed wrappers are built on (ADR-0041/ADR-0044), and it
  is the *inherited* sense, which is the one with an external source of truth.
- **Suffix every duration with `Ms`.** Rejected: it renames `debounce`, `retry`, `httpClient`
  and `throttle` options — the library's most imported surface — to restate what the names
  already say.

## Consequences

- **Eleven breaking changes**, all in the window built for them: six `label` → `ariaLabel`
  (plus `IconSpec`), `autohide`/`delay` → `autoHideMs`, three method renames, and
  `onPage` → `onPageChange`.
- **Every one of them fails loudly** thanks to ADR-0047: a stale option key is
  `TypeError: unknown option 'label'`, and a stale method call is
  `list.update is not a function`. Neither can be mistaken for working code — which is why
  17.7 had to land first, and why doing 17.8 before it would have been the wrong order.
- The rules are testable and tested: `naming-freeze.test.js` pins each word, including the
  old spellings being rejected rather than accepted.
- Zero measured size change: renames are renames, and no option was added or removed.
- Spec 04 F53, F56–F59, F62, F63, F65 and F69 are amended in this PR.
- What is *not* settled here: `bsToast` accepting a `document` override while `bsPagination`
  and `bsTable` (both container-taking) do not — an option-surface asymmetry 17.7 surfaced,
  left to **17.9**, which owns the instance and option contract across shapes.

## References

- [v1.0.0 readiness review](../releases/v1.0.0-readiness-review.md) §2.2, §2.3, §2.4, §4.
- `src/test/javascript/it/d4np/utils/naming-freeze.test.js` — the vocabulary, pinned.
- Spec 04 §2 — the amended F-numbers.

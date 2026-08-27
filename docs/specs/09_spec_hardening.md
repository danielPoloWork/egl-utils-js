# Software Specification: Hardening — Untrusted URLs, Column Visibility & Grid Keyboard Navigation (JavaScript (ES2023))

> Ninth-wave contract for `egl-utils-js` (milestone M23). Frozen once accepted: diverging
> implementation updates this spec in the same PR or adds an ADR superseding the relevant
> section. Functional numbering continues the global sequence
> ([`01_spec_utils.md`](01_spec_utils.md) owns F1–F25,
> [`02_spec_core_extensions.md`](02_spec_core_extensions.md) owns F26–F41,
> [`03_spec_dom_ui_table.md`](03_spec_dom_ui_table.md) owns F42–F51,
> [`04_spec_bootstrap_toolkit.md`](04_spec_bootstrap_toolkit.md) owns F52–F81,
> [`05_spec_browser_distribution.md`](05_spec_browser_distribution.md) owns F82–F87,
> [`06_spec_table_data.md`](06_spec_table_data.md) owns F88–F100,
> [`07_spec_application_ux.md`](07_spec_application_ux.md) owns F101–F111,
> [`08_spec_form_engine.md`](08_spec_form_engine.md) owns F112–F125): this document owns
> **F126–F131** and **NFR-45–NFR-49**.
>
> **This wave adds no new entry and no new subject.** It closes three gaps in surfaces that
> already exist, which is why it is the first wave whose scope is defined by an audit rather
> than by a product idea: every item below is a place where the library's own contracts do
> not reach as far as they claim.
>
> **It is the disposition of what [ADR-0046](../adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)
> deferred**, re-decided now that M18–M21 have delivered everything that triage adopted.
> [ADR-0083](../adr/0083-the-deferred-pile-re-dispositioned.md) is that record; §1 states the
> three it kept and why the rest is closed.

## 1. Objective & Business Context

ADR-0046 triaged a 74-section proposal in August 2026 and split it four ways: **delivered**,
**adopted** (M18–M21, all now shipped), **deferred** as unnumbered candidates, and **rejected**
with a governing reason. The deferred pile carried an explicit trigger — the field-controller
group was to be "revisited after M21 fixes the form contract they would attach to" — and M21 is
closed. This spec is the revisit.

Its answer is mostly *no*, and the reasoning belongs here rather than only in the ADR, because a
spec that admits what it refuses is the one a later reader can trust. What the deferred pile
mostly contains is **widgets** — combobox, date and time pickers, tree view, stepper, command
palette, context menu, split pane — and a widget catalogue is a different product with a
different charter. Adopting it would turn a utilities library into a component framework by
accretion, which is the shape spec 03 §1 and spec 04 §1 both name as a non-goal.

Three candidates survived, and none of them is a widget. Each is a place where an **existing**
contract falls short of what it says:

**A URL is not text, and this library only protects text.** Escape-by-default (F52, ADR-0037)
guarantees that a record's *content* cannot become markup. It says nothing about a record's
*URL*: eight call sites across the Bootstrap builders write an `href` or a `src` taken from
caller or record data — a card image, a list-group item, a breadcrumb link, a navbar brand, a
nav item, a child item, a carousel image — and none of them looks at the protocol. A record
field containing `javascript:…` becomes a live link that executes with the page's authority.
`docs/security/threat-model.md` records these builders as a boundary whose control is "render
exactly what they receive"; for a URL, that is not a control at all. This is the wave's security
item (F126–F127).

**A table can hide a column and cannot say so.** F99 gave columns a width a user can drag, F100
gave them an order a user can change and read back, and both persist through the same state the
URL carries. Column *visibility* — the oldest request in any data grid, and the one the proposal
lists first under §7.12 — has no representation at all: `BsTableColumn` has `sortable`,
`resizable`, `movable` and `width`, and no `visible`. So an application that wants twelve columns
available and five shown has to build two column arrays and swap them, losing sort state,
resize state and reorder state on every toggle (F128–F129).

**The table is the one component whose keyboard story is ours.** Bootstrap owns the keyboard
behaviour of tabs, dropdowns, navbars and modals, which is why this library ships none: the peer
is the accessible implementation. A data grid has no vendor behind it, and `bsTable` is where the
library already writes keyboard code of its own — the resize and reorder grips are arrow-key
operable. What is missing is the pattern those grips sit inside: **arrow-key navigation across
rows and cells**, with one tab stop for the whole grid, which is what the ARIA grid pattern asks
for and what a keyboard user needs before either grip is reachable in a realistic table (F130–F131).

This also resolves the proposal's §50 "roving tabindex for groups and menus" — adopted **here**,
where it has a consumer, rather than as a free-standing primitive. An audit of the source found
exactly one file containing arrow-key handling (`bootstrap-table.js`, the two grips), so a shared
roving-tabindex export would have been a correct implementation with nothing to call it — the
mirror image of the F109 lesson, and just as expensive.

**Non-goals, restated for this wave.** No new entry. No new widget. No sanitizer of its own — the
URL guard is a protocol decision, not an HTML one, and ADR-0030's rule that a sanitizer is a
required parameter is untouched. No virtualization (spec 03 §1; only a superseding ADR reopens
it). No grouping, aggregation or inline editing in the table: the first would make the pipeline a
tree rather than a derivation over rows, and the second would make the table an input surface,
which is what `egl-utils-js/forms` is for.

## 2. Functional Requirements

### The untrusted URL

- F126 **A URL guard, and it answers rather than throws.** One function decides whether a URL is
  safe to put in an `href` or a `src`: an allow-list of protocols (`http:`, `https:`, `mailto:`,
  `tel:`, and relative or fragment references), applied after the platform's own parsing rather
  than by string inspection, so `java\tscript:` and `JaVaScript:` and a percent-encoded colon are
  all the same answer. It returns a decision a caller can branch on — the URL when it passes, and
  `null` when it does not — because a builder rendering a list of records cannot afford one bad
  field to throw away the other nine rows. A caller who wants a throw writes it.
- F127 **The builders route their URLs through it, and say what they dropped.** Every place a
  builder writes an `href` or `src` from caller data consults the guard. A refused URL leaves the
  attribute **unset** rather than empty (an `href=""` is a link to the current page, which is a
  different lie), and the affected element is still rendered with its label intact: a record with
  a hostile link is a record with a broken link, not a missing row. The refusal is observable —
  the element carries a data attribute naming it — because a control that silently changes what a
  page shows is indistinguishable from a bug. An **injected** allow-list extends the protocol set
  for the applications that legitimately need one (`app:`, `ms-excel:`), which is the ADR-0031
  policy-by-injection rule applied to a security decision rather than a class name.

### Column visibility

- F128 **Visibility is a column property, and hiding one keeps everything else.** `visible: false`
  on a column descriptor removes it from the rendered table without removing it from the model:
  sort, filter, search, resize width and reorder position all survive being hidden and come back
  intact. Hiding the column a table is sorted by does **not** clear the sort — the rows stay in
  that order, because the user asked for both and neither cancels the other.
- F129 **A chooser the user drives, and the same state everything else uses.** A control that
  lists the columns and toggles them, keyboard-operable and announced (NFR-49), writing through
  the same command surface a caller could call directly. Visibility joins the state F92/F93 already
  serialize, so a hidden column survives a reload and a shared link. A column may be marked
  **not hideable** — a table whose every column is hidden is a table with nothing in it, and the
  chooser refuses the last one rather than letting a user reach that state.

### Grid keyboard navigation

- F130 **One tab stop, and the arrows move inside it.** The table takes a single position in the
  page's tab order; arrow keys move a *cell* focus inside it, `Home`/`End` reach the row's ends,
  `Ctrl+Home`/`Ctrl+End` the table's, and `PageUp`/`PageDown` move by the visible viewport. The
  moving focus is a roving `tabindex` rather than a rendered highlight, so a screen reader reads
  the cell it lands on and the browser scrolls it into view without this library owning either
  behaviour. Paged tables move within the current page; the navigation does not turn pages, because
  an arrow key that fetches data is a surprise.
- F131 **What is already interactive stays interactive.** A cell containing a control — a selection
  checkbox (F95), a row-action button, a link — hands the keyboard to it in the way the grid pattern
  prescribes: `Enter` enters the cell's control, `Escape` returns to the grid, and `Tab` inside an
  entered cell is the browser's, not ours. The resize and reorder grips (F99/F100) keep the
  shortcuts they already have, and this navigation is what makes them reachable rather than a
  second, competing keyboard vocabulary.

## 3. Non-Functional Requirements

- NFR-45 **Additive-only (hard).** As NFR-37 before it: no existing export signature, option name,
  error code or `exports`-map path changes. The **140 exports across 12 entries** at v1.4.0 keep
  their names and their meanings; `BsTableColumn` gains optional properties, which ADR-0003
  classifies as a minor addition. **Mechanically proved** by the before/after surface inventory
  (§6). This wave adds **no entry**.
- NFR-46 **The URL guard costs the entries that do not use it nothing (hard).** It is a pure
  function with no peer, no `document` and no options bag beyond its allow-list, and it is reached
  by `/bootstrap`'s builders through an **internal module** — the `option-keys.js`/`lifecycle.js`
  shape — never by one entry importing another. Where its *public* export lands is a **measured**
  decision and not a preference: the root sits at 6 103 B against a 6.25 kB clause (147 B free) and
  `/text` at 924 B against 950 B (26 B free), so the obvious homes are the two that cannot absorb
  it. The implementing item measures before choosing and records the number, the way spec 08
  NFR-38 required of the F120 costume — and if the answer is `/sanitize`, the reason is that a
  protocol allow-list is the same job as an HTML allow-list, not that it fitted.
- NFR-47 **Budgets are measured, then pinned — and the figures are now gated.** Per-entry rows are
  pinned at measured + ≤ 7% per the house rule, each at its **own** margin
  ([ADR-0082](../adr/0082-a-figure-nobody-checks-is-prose.md)). `/bootstrap` is the binding
  constraint again: it measures 24 632 B against ADR-0041's **25 kB entry clause** with **368 B
  free**, and F127 touches four modules inside that entry. If the routing does not fit, the
  recorded reason is the ceiling and not the layering — and unlike every previous wave, a stale
  figure now fails `check:size-figures` rather than sitting in the prose.
  NFR-22's derived clause stands at **70 kB with 20 B under it**, so this wave re-derives it by
  spec 05's method and commits the arithmetic.
- NFR-48 **The trust boundary moves, and the threat model moves with it (hard, security).** F126–F127
  change what the "Rendered record data" boundary controls: today its mitigation is
  escape-by-default, which covers content and not URLs. The implementing PR updates
  `docs/security/threat-model.md` — the boundary row, the Tampering and Elevation-of-privilege
  cells, and the STRIDE pass for the guard itself — in the **same PR**, per AGENTS.md §7. The
  corpus is the requirement, not the prose: `javascript:`, `data:text/html`, `vbscript:`, tab- and
  newline-split schemes, percent-encoded colons, uppercase and mixed-case variants, a protocol-relative
  `//host`, and a `blob:` URL each get an asserted verdict.
- NFR-49 **Operable and announced (hard).** As NFR-36/NFR-44. The chooser is keyboard-operable and
  carries an accessible name; a visibility change is announced through F110. The grid navigation is
  asserted in the **browser suite** and not only in jsdom, because "where did focus go" and "did the
  cell scroll into view" are questions about an engine — the same reason F121's focus placement is
  proved there. Nothing in this wave uses colour as its only indicator.

## 4. Logical Architecture & Core Algorithm

**Three items, three existing homes, no new layer.**

1. **The URL guard is a primitive.** Pure, dependency-free, and internal-first: the builders on
   `/bootstrap` import the module, not an entry, so nothing about this couples `/bootstrap` to
   `/sanitize` and ADR-0030's "the sanitizer is a required parameter" stays exactly as it is. The
   public export exists for the applications that render their own links; its home is NFR-46's
   measured decision.

   The algorithm is deliberately boring, and its shape is the whole security argument: **parse,
   then decide.** `new URL(value, base)` normalises the escapes, the whitespace and the case that
   every string-matching implementation of this check gets wrong; the decision is then a `Set`
   lookup on `url.protocol`. A value that fails to parse *and* looks like a relative reference is
   allowed (that is what a relative reference is); a value that fails to parse otherwise is
   refused. No regular expression sees the input, so there is no backtracking to bound.

2. **Column visibility belongs to the column descriptor, and the chooser to `bsTable`.** The
   descriptor is where `resizable` and `movable` already live, so `visible` joins them rather than
   arriving as a parallel map; the derivation (`/table`) never learns about it, because a hidden
   column is a **rendering** fact and F42's pipeline sorts, filters and pages rows regardless of
   which columns a viewer can see. That split is what keeps F128's "hiding the sort column does not
   clear the sort" true by construction rather than by care.

3. **Grid navigation is a behaviour on the rendered table.** It attaches to the `<table>` `bsTable`
   already owns, reads the same column order F100 exposes, and writes nothing except `tabindex` and
   focus. It is not a general-purpose export: the ARIA grid pattern is a contract about a *grid*,
   and a roving-tabindex helper with no grid around it is the primitive §50 asked for and nothing
   would have called (§1).

**What the wave deliberately does not restructure.** No item here introduces a new instance shape,
a new options-bag convention or a new event name. Every addition is an option on a bag that exists,
a property on a descriptor that exists, or a method on an instance that exists — which is the
reason a hardening wave can be planned as three items rather than a milestone with a spec of
architecture.

## 5. Public Interface

New, SemVer-protected once shipped. Names are **indicative**; what is contractual is the set of
capabilities and their error model.

- **The URL guard** — one function, indicatively `safeUrl(value, options)`, returning the URL or
  `null`. Its entry is NFR-46's measured decision. Options: an `allow` list of extra protocols and
  a `base` for resolving relative references.
- **On `BsTableColumn`** (`egl-utils-js/bootstrap`): `visible` and `hideable`, both optional and
  both defaulting to the behaviour tables have today, so no existing call site changes meaning.
- **On the `bsTable` instance**: commands to show, hide and toggle a column by key, and a query for
  the current set — the same command/query split ADR-0049 fixed. The chooser is an option on the
  existing `controls` bag (F65's neighbourhood), not a separate export.
- **Grid navigation**: an option on `bsTable` (`keyboard`, indicatively), opt-in for the same reason
  `sticky`, `resize`, `reorder` and `selection` are — a table that does not want a single tab stop
  must not silently get one.
- **Error model**, continuing ADR-0003 and ADR-0047's boundary:
  - a malformed option or an unknown key is a `TypeError` naming it;
  - a command naming a column the table does not have is a `TypeError`, as `setValues` is for a
    field name (F113's precedent);
  - **a refused URL is not an error.** F126 returns `null` and F127 renders the element without the
    attribute: an untrusted value being untrustworthy is the expected case, and the taxonomy is for
    operational failures a caller branches on;
  - hiding the last hideable column is refused as a `TypeError` — a programming error, not a state
    the user reached.

## 6. Verification & Test Strategy

- **F126 (the guard)** — a **negative-path corpus**, and it is the requirement rather than a
  courtesy: `javascript:alert(1)`, `JaVaScRiPt:`, `java\tscript:`, `java\nscript:`,
  `%6a%61%76%61script:`, `data:text/html;base64,…`, `vbscript:`, `blob:`, `file:`, a
  protocol-relative `//evil.example`, a URL with credentials, and the legitimate set
  (`https:`, `http:`, `mailto:`, `tel:`, `/relative`, `./relative`, `#fragment`, `?query`) each
  asserted for verdict. A **property test** over randomised strings asserting the guard is total —
  it returns a string or `null` and never throws, for any input — because a security check that
  throws on a hostile input has moved the failure rather than removed it.
- **F127 (the builders)** — every one of the eight call sites asserted: a hostile URL leaves the
  attribute absent, the element present and its label intact, and the refusal observable. The
  injected allow-list asserted to extend rather than replace the default set, and asserted **not**
  to be reachable through an options bag that does not declare it (ADR-0047).
- **F128–F129 (visibility)** — a hidden column asserted absent from the rendered header and every
  row; sort, filter, search, width and order asserted to survive a hide/show cycle; the sort
  asserted **not** cleared by hiding its column; visibility asserted to round-trip through the
  F92/F93 URL state; the last hideable column asserted refused. The chooser tested through the
  keyboard as well as the pointer, per NFR-49.
- **F130–F131 (grid navigation)** — the movement matrix in jsdom (which key from which cell reaches
  which cell, including the paged edges), and the part jsdom cannot answer in the **browser suite**:
  that focus actually lands where the model says, that the cell is scrolled into view, that one
  `Tab` from outside reaches the grid and one more leaves it, and that entering a cell's control and
  escaping back works on a real engine. Asserted on three engines, as F121 and F123 are.
- **NFR-45 (additive-only)** — the before/after public-surface inventory, as NFR-31/NFR-37.
- **NFR-46/NFR-47 (budgets)** — the guard's home measured before it is chosen, with the number
  recorded; `/bootstrap` measured against ADR-0041's clause after F127; every touched row re-pinned
  at its own margin and the NFR-22 derivation recomputed, with `check:size-figures` now failing a
  figure that does not match.
- **NFR-48 (the boundary)** — the corpus above, plus the threat-model update reviewed as part of the
  PR rather than as a follow-up.
- **NFR-49 (a11y)** — the announcement asserted through the F110 region; the grid's tab-stop count
  asserted in a real engine; no assertion in this wave depends on colour.

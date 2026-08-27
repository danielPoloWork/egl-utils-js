# ADR-0083: The deferred pile, re-dispositioned — three gaps kept, the widget catalogue closed

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Daniel Polo
- **Related:** [ADR-0046](0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md) (the
  triage this re-decides the *Deferred* rows of — its Adopted, Delivered and Rejected verdicts
  stand), [spec 09](../specs/09_spec_hardening.md) (the wave this admits), ROADMAP M23;
  [spec 03 §1](../specs/03_spec_dom_ui_table.md) and
  [spec 04 §1](../specs/04_spec_bootstrap_toolkit.md) (the non-goals most of these closures
  cite), [ADR-0030](0030-sanitize-is-a-required-parameter.md) (the rule the URL guard must not
  bend), [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md)
  (escape-by-default, which is what covers content and not URLs),
  [ADR-0041](0041-a-peer-looked-up-not-imported.md) (the 25 kB `/bootstrap` clause F127 is
  measured against), [ADR-0082](0082-a-figure-nobody-checks-is-prose.md) (the figures gate this
  wave's budgets are now held to)

## Context

ADR-0046 dispositioned a 74-section proposal on 2026-08-09: **Delivered** for what the library
already was, **Adopted** for four waves, **Deferred** for candidates recorded but unnumbered, and
**Rejected** with a governing reason. Everything it adopted has shipped — M18 browser
distribution, M19 table data, M20 application UX, M21 the form engine — and `ROADMAP.md` reached
zero open items at v1.4.0.

That makes the deferred pile due, and one row of it named its own trigger: the field-controller
group was to be *"revisited after M21 fixes the form contract they would attach to"*. M21 is
closed. This record is the revisit.

The pile is not homogeneous, and reading it as one question is what would produce a bad answer.
Sorted by what the items actually are:

- **widgets** — combobox, date/time/range pickers, tree view, stepper, command palette, context
  menu, split pane, dropzone, virtual list, infinite scroll, notification centre, empty state,
  popconfirm (§56.1–§56.15), plus most of the field controllers (§9–§14, §16);
- **table features that change what the pipeline is** — grouping and aggregation, inline editing
  (§7.13, §7.11);
- **a layout interaction** — pinned/frozen columns (§7.12);
- **gaps in contracts that already exist** — URL validation for data-driven links (§51), column
  visibility and a chooser (§7.12), and keyboard navigation (§50).

Only the last group is this library's shape. And each of those three was checked against the
source before being kept, because "the proposal asks for it" is not evidence that anything is
missing.

**The URL gap is real and countable.** Eight call sites write an `href` or a `src` from caller or
record data with no protocol check:

| File | Line | Attribute |
|---|---:|---|
| `bootstrap-composites.js` | 212 | `src` — card image |
| `bootstrap-composites.js` | 412 | `href` — list-group item |
| `bootstrap-composites.js` | 588 | `href` — breadcrumb link |
| `bootstrap-nav.js` | 814 | `href` — navbar brand |
| `bootstrap-nav.js` | 873 | `href` — nav item |
| `bootstrap-nav.js` | 908 | `href` — nav child item |
| `bootstrap-overlays.js` | 287 | `src` — carousel image |

Escape-by-default (ADR-0037) is what makes a record's *content* safe, and it does nothing for a
record's *URL*: `javascript:…` in a data field becomes a live link with the page's authority. The
threat model states the mitigation for this boundary as "they render exactly what they receive,"
which for an `href` is not a mitigation.

**The visibility gap is real.** `BsTableColumn` carries `sortable`, `resizable`, `movable`,
`width` and `minWidth` — and no `visible`. There is no chooser. An application that wants twelve
columns available and five shown swaps two column arrays and loses sort, resize and reorder state
each time.

**The keyboard gap is real, but not where the proposal put it.** §50 asks for "roving tabindex for
groups and menus" as a cross-cutting primitive. An audit of `src/main` found arrow-key handling in
**exactly one file** — `bootstrap-table.js`, the F99 resize and F100 reorder grips — because
Bootstrap owns the keyboard behaviour of tabs, dropdowns, navbars and modals, which is precisely
why this library ships none of it. A free-standing roving-tabindex export would therefore be a
correct implementation with nothing in the library to call it. What *is* missing is the pattern the
two existing grips sit inside: a data grid has no vendor behind it, and `bsTable` has no
arrow-key navigation across rows and cells.

## Decision

**1. Adopt three items as spec 09 / milestone M23**, all inside surfaces that already exist, none
of them a widget and none of them a new entry:

| Item | What | Why now |
|---|---|---|
| 23.1 | A URL guard, and the eight builder call sites routed through it (F126–F127) | The boundary's stated control does not cover URLs |
| 23.2 | Column visibility on the descriptor, and a chooser (F128–F129) | The descriptor has no `visible`; state already persists through F92/F93 |
| 23.3 | Grid keyboard navigation for `bsTable` (F130–F131) | The one component whose keyboard story has no vendor, and where the library already writes keyboard code |

**2. §50's roving tabindex is adopted *as* 23.3, not as a primitive.** It gets a consumer or it
does not get written. This is the F109 lesson read in the other direction: F109 was extracted
because a correct implementation existed where nothing else could reach it, and the same reasoning
refuses a correct implementation that nothing would reach at all.

**3. The widget catalogue is closed as Rejected, not deferred again.** §56.1–§56.15 and the
field-controller group are a component library: a different charter, a different test strategy (a
combobox is an ARIA listbox with typeahead, async options and virtualised results before it is
useful), and a different maintenance surface. Deferring them a second time would keep a promise
open that the last twelve months of this repository's decisions have consistently voted against —
and an unnumbered candidate list nobody intends to number is the roadmap equivalent of a stale
size figure (ADR-0082). Two are called out because they look small and are not: **empty state** and
**popconfirm** are one `bsCard` and one `bsPopover` composition away at a call site, which is
where they belong.

**4. Grouping, aggregation and inline editing are Rejected on identity, not size.** Grouping makes
the pipeline's output a tree; F42's contract is a **derivation over rows** — filter, search, sort,
paginate — and every consumer of `view()` reads it as such. Inline editing makes the table an input
surface, which is what `egl-utils-js/forms` was built for four items ago; a table that edits would
own a second form contract or delegate to the first one across a boundary neither was designed for.

**5. Pinned columns stay Deferred, with a named trigger.** They are the only row where the answer
is "not yet" rather than "no": frozen columns are a `position: sticky` interaction with the F98
sticky header and the F99 resize widths, and the honest precondition is a measurement of that
interaction on three engines — not a decision taken from a proposal bullet. The trigger is 23.2
shipping, because a chooser that hides columns changes which columns a pin would apply to.

**6. Where the URL guard's public export lands is a measured decision (spec 09 NFR-46).** The two
homes that read as obvious cannot absorb it: the root has **147 B** free under its 6.25 kB clause
and `/text` has **26 B**. The builders reach it through an internal module — the
`option-keys.js`/`lifecycle.js` shape — so no entry imports another, and ADR-0030's "the sanitizer
is a required parameter" is untouched: a protocol allow-list is not a sanitizer and takes no peer.

## Alternatives Considered

| Option | Why not |
|---|---|
| **Close the whole pile and declare the surface complete** | The strongest competing option, and it fails on the URL row: eight call sites turn record data into a live link with no protocol check, and "we are feature-complete" is not an answer to that. Two of the three items are gaps in what the library already claims, not additions to what it offers. |
| **Adopt the widget catalogue** | A component library with a utilities library's charter, test strategy and budget clauses. Every widget in that list needs a11y depth this repository would have to build from scratch, against a peer that already ships the accessible version of the ones it covers. |
| **Adopt the combobox alone** | Tempting: it is the one control Bootstrap genuinely lacks and the form engine makes reachable. Still a widget, and a large one — listbox semantics, typeahead, async options, virtualised results, mobile behaviour — so it is a milestone of its own, not an item in a hardening wave. A superseding ADR reopens it if that is what the owner wants next. |
| **Ship the URL guard as a `sanitize` option** | Conflates two decisions. `sanitizeHtml` delegates to a peer under ADR-0012/0055; the URL guard has no peer, no `document` and no failure mode beyond a boolean. Folding it in would make `/bootstrap` depend on a peer-bearing entry for a `Set` lookup. |
| **Make the URL guard throw on a refusal** | A builder rendering fifty records cannot let one hostile field discard the other forty-nine. It returns `null`, the element renders without the attribute, and the refusal is observable — which is the ADR-0028 posture (say what happened) without the ADR-0028 remedy (fail fast) being wrong for a list. |
| **Put visibility in a parallel `hiddenColumns` option** | A second place where a column's behaviour is configured, drifting from the descriptor that already holds `resizable` and `movable`. Visibility is a property of the column, and F92/F93 already know how to serialize the descriptor's state. |
| **A general roving-tabindex export** | Nothing in the library would call it (one file has arrow keys, and those are the grips). See decision 2. |

## Consequences

- **ADR-0046 stays Accepted.** This record supersedes only its *Deferred* verdicts; its Adopted
  rows are delivered, its Rejected rows keep their reasons, and reopening one of those still needs
  its own superseding ADR. The appendix below is the new durable disposition, because the source
  document is in Italian and cannot enter the repository (AGENTS.md §2).
- **M23 is three items and no new entry** — the first wave planned as a set of gaps rather than a
  capability. `ROADMAP.md`'s Spec Coverage Map gains a spec 09 sub-table; the README milestone
  table gains a row.
- **`/bootstrap` is the binding budget constraint again**, at 368 B under ADR-0041's 25 kB clause
  with F127 touching four of its modules. Unlike every previous wave, a figure that no longer
  matches now fails a gate rather than sitting in the prose (ADR-0082).
- **The threat model changes in 23.1's own PR**, not after it: F126–F127 alter what the "Rendered
  record data" boundary controls, which is the AGENTS.md §7 trigger and spec 09 NFR-48's explicit
  condition.
- **The widget answer is now on the record as a decision** rather than as an omission. A future
  owner who wants a combobox has a file to supersede and a reason to argue with, which is worth
  more than an open candidate list.

## Appendix — the deferred pile, re-dispositioned

Verdicts: **Adopted** (with its ROADMAP home) · **Deferred** (recorded candidate, with the trigger
that would reopen it) · **Rejected** (with the governing reason).

| ADR-0046 deferred row | Verdict now | Reason / where |
|---|---|---|
| §7.12 show/hide columns, column chooser | **Adopted → 23.2** | The descriptor has no `visible`; state persistence already exists (F92/F93). |
| §7.12 frozen/pinned columns | **Deferred** | A `position: sticky` interaction with F98's sticky header and F99's widths; the trigger is 23.2 shipping, and the precondition is a three-engine measurement rather than a proposal bullet. |
| §7.12 responsive column collapsing, auto-fit, column view presets | **Rejected** | Application policy over the descriptor 23.2 adds: which columns matter at which width is a product decision, and presets are two calls to the commands 23.2 ships. |
| §7.13 grouping and aggregations | **Rejected** | Makes the pipeline's output a tree; F42's contract is a derivation over rows, and every consumer of `view()` reads it that way. |
| §7.11 inline editing | **Rejected** | Makes the table an input surface, which is `egl-utils-js/forms`' job as of M21. |
| §7.16 / §56.10 infinite scroll, §56.9 virtual list | **Rejected** | Windowing is a spec 03 §1 non-goal; unchanged from ADR-0046, and only a superseding ADR reopens it. |
| §9–§14 field controllers (input/textarea, select, checkbox/radio, range, input group, floating label) | **Rejected** | The trigger fired and the answer is no: with M21 shipped, what these add over `createForm` + the platform's own controls is design-system sugar (floating label, input group) or a widget (SmartSelect — see the combobox row). |
| §16 file input / upload, §56.11 dropzone | **Rejected** | A widget with a transport: progress, retry, chunking and drag-and-drop belong to an application or to a component library. `createForm`'s `toFormData()` is the part that was ours, and it exists. |
| §41–§43 typography / image / figure behaviours | **Rejected** | Class juggling over Bootstrap's own vocabulary (§47's rejection, applied one tier down). |
| §50 roving tabindex | **Adopted → 23.3, reshaped** | Adopted as the table's grid navigation, where it has a consumer; refused as a free-standing primitive, because exactly one file in `src/main` contains arrow-key handling. |
| §50 keyboard-navigation manager | **Rejected** | The same reason, without the grid: a manager for keyboard behaviour the peer already owns. |
| §51 URL protocol allow-list | **Adopted → 23.1** | Eight builder call sites write a data-driven `href`/`src` with no protocol check. |
| §56.1 combobox / autocomplete | **Rejected, reopenable** | The one widget with a real case (Bootstrap lacks it; the form engine makes it reachable), and too large for a hardening wave: listbox semantics, typeahead, async options, mobile behaviour. A milestone of its own if the owner wants it, via a superseding ADR. |
| §56.2–56.4 date, date-range and time pickers | **Rejected** | The platform ships `<input type="date">`/`type="time">`, and a picker that improves on them is a localisation and a11y project, not a utility. |
| §56.5 tree view, §56.6 stepper, §56.7 command palette, §56.8 context menu, §56.12 split pane | **Rejected** | Widgets; a different charter (§1 of spec 09). |
| §56.13 empty state, §56.14 popconfirm | **Rejected** | Each is one composition at a call site — a `bsCard` with a message, a `bsPopover` around the F101 confirm — and a named export for it would be a preset masquerading as a component. |
| §56.15 notification centre | **Rejected** | The stream is F103's toast manager; the panel is application scaffolding, which ADR-0046 rejected for the ERP shell and this inherits. |

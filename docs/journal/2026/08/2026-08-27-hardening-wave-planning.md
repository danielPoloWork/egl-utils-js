# 2026-08-27 — The deferred pile, re-dispositioned (spec 09, M23)

## What got done

- **[ADR-0083](../../adr/0083-the-deferred-pile-re-dispositioned.md)** — the re-disposition of
  everything [ADR-0046](../../adr/0046-one-proposal-triaged-and-the-no-bundler-wave-adopted.md)
  deferred in August, now that M18–M21 have shipped everything it adopted. Three candidates kept,
  the widget catalogue **closed as Rejected** rather than deferred a second time.
- **[`docs/specs/09_spec_hardening.md`](../../specs/09_spec_hardening.md)** — F126–F131,
  NFR-45–NFR-49. No new entry, no new subject.
- **Milestone 23** with three items, the spec coverage sub-table, and the README row.

## The pile had a trigger, and it fired

ADR-0046 wrote of the field-controller group: *"Deferred; revisited after M21 fixes the form
contract they would attach to."* M21 closed this morning. So this was due, and the useful move was
to stop reading the pile as one question — it is four:

| What the rows actually are | Verdict |
|---|---|
| widgets (combobox, pickers, tree, stepper, palette, context menu, split pane, dropzone…) | **Rejected** — a different product |
| table features that change what the pipeline *is* (grouping, inline editing) | **Rejected** — on identity, not size |
| a layout interaction (pinned columns) | **Deferred**, with a named trigger |
| gaps in contracts that already exist | **Adopted** — three of them |

Only the last group is this library's shape, and each was checked against the source before being
kept. "The proposal asks for it" is not evidence that anything is missing.

## What the evidence said

**The URL gap is real and countable.** Eight call sites write an `href` or a `src` from caller or
record data with no protocol check:

```
bootstrap-composites.js:212   src   card image
bootstrap-composites.js:412   href  list-group item
bootstrap-composites.js:588   href  breadcrumb link
bootstrap-nav.js:814          href  navbar brand
bootstrap-nav.js:873          href  nav item
bootstrap-nav.js:908          href  nav child item
bootstrap-overlays.js:287     src   carousel image
```

Escape-by-default (ADR-0037) is what makes a record's *content* safe. A URL is not content: a field
containing `javascript:…` becomes a live link with the page's authority. And the threat model states
this boundary's control as *"they render exactly what they receive"* — which, for an `href`, is not
a control. That sentence is the finding.

**The visibility gap is real.** `BsTableColumn` carries `sortable`, `resizable`, `movable`, `width`
and `minWidth`, and no `visible`. No chooser exists. Twelve columns available and five shown means
swapping two column arrays and losing sort, resize and reorder state on every toggle.

**The keyboard gap is real, but not where the proposal put it.** §50 asks for "roving tabindex for
groups and menus" as a cross-cutting primitive. Grepping `src/main` for arrow-key handling found
**one file** — `bootstrap-table.js`, the F99 resize and F100 reorder grips — because Bootstrap owns
the keyboard behaviour of tabs, dropdowns, navbars and modals, which is exactly why this library
ships none of it.

So a free-standing roving-tabindex export would have been a **correct implementation with nothing
to call it**: the F109 lesson read backwards. F109 was extracted because a correct implementation
existed where nothing else could reach it; this one would have been reachable and unreached.

What *is* missing is the pattern the two grips sit inside. A data grid has no vendor behind it, and
`bsTable` has no arrow-key navigation across rows and cells — so §50 is adopted **as 23.3**, where
it has a consumer.

## Closing the widget catalogue, and why not "deferred" again

Deferring it a second time would keep a promise open that a year of this repository's decisions has
voted against, and an unnumbered candidate list nobody intends to number is the roadmap equivalent
of a stale size figure — which is the defect 22.1 spent a whole item removing this morning.

Two look small and are not, and the ADR says so explicitly: **empty state** and **popconfirm** are
one `bsCard` and one `bsPopover` composition away *at a call site*. A named export for either would
be a preset masquerading as a component.

One is rejected but **reopenable**, and the ADR records that too: the **combobox**. It is the one
control Bootstrap genuinely lacks, and the form engine has just made it reachable — but listbox
semantics, typeahead, async options and mobile behaviour make it a milestone rather than an item.
A superseding ADR is how it comes back, which is a better artefact than an open candidate row.

## The decision the spec defers, deliberately

Where the URL guard's *public* export lands is measured, not chosen (NFR-46), because the two
obvious homes cannot absorb it:

| Entry | Measured | Clause | Free |
|---|---:|---:|---:|
| root | 6 103 B | 6.25 kB | **147 B** |
| `/text` | 924 B | 950 B | **26 B** |

The builders reach it through an **internal module** either way — the `option-keys.js` /
`lifecycle.js` shape — so no entry imports another and ADR-0030's "the sanitizer is a required
parameter" is untouched: a protocol allow-list has no peer and is not a sanitizer. If the answer
turns out to be `/sanitize`, the reason must be that an allow-list of protocols is the same job as
an allow-list of tags — not that it fitted.

`/bootstrap` is the binding constraint again: **368 B** under ADR-0041's 25 kB clause, with 23.1
touching four of its modules. Unlike every previous wave, a figure that stops matching now fails
`check:size-figures` (ADR-0082) instead of sitting in the prose.

## Next

**23.1**, the security item: the guard, the eight call sites, the negative-path corpus and the
threat-model update in the same PR. Then 23.2 and 23.3.

The npm publish — the step no release has ever reached — is still M22's 22.2 and still the owner's
dispatch.

# 2026-08-21 — Planning the table-data wave (spec 06, M19)

## What got done

- **`docs/specs/06_spec_table_data.md`** — the M19 contract, owning **F88–F100** and
  **NFR-25–NFR-30**.
- M19's roadmap preamble rewritten from "provisional" to adopted, linking the spec; each of
  the seven items mapped to its F-numbers and its wording sharpened where the spec sharpened
  it. **Nothing renumbered**, per ADR-0046.
- Spec 06 coverage-map section added.
- **No implementation.** This is the planning PR the roadmap and ADR-0046 both require
  before 19.1 can start.

## Why this PR exists at all

The session opened with "procediamo con M19.1?" and the answer was no — not from caution but
from a rule the project wrote for itself. ADR-0046's Decision plans M19–M21 as provisional
milestones "each still owing its own spec (06–08) **in its own planning PR before
implementation starts**", and the alternative *"author specs 06–08 now, alongside spec 05"*
was explicitly **rejected**: specs freeze on acceptance, and M17 was about to move the very
inputs those specs would freeze against.

That reasoning has now paid off in a way worth recording. Spec 06 is written against a
**1.0'd surface** — 113 frozen exports, ADR-0047's unknown-key strictness, ADR-0049's
command/query split, ADR-0056's descriptor checking, the Node 22 floor. A spec 06 drafted in
early August would have specified against none of those and would be in its third amendment
by now.

## The constraint that shaped the whole spec

**NFR-25: additive-only, and mechanically proved.** This is the first wave planned after 1.0,
so it cannot change one export signature, option name, error code or exports-map path. That
is not a formality bolted on at the end — it decided the architecture:

- async and selection attach **around** the F42 derivation rather than inside it, because
  changing `tablePipeline`'s contract is a major;
- new options land only on bags that already reject unknown keys (ADR-0047), which makes the
  addition observable and its absence safe;
- the proof is the public-surface inventory diffed before and after the wave — the 17.1
  review's own method, now a gate rather than a review technique.

## What the spec deliberately does not decide

Where async lives. An adapter owning a pipeline, or an option on `tablePipeline` that swaps
the derivation for a server round-trip — both defensible, and they differ in what "the
pipeline's state" *means* once the server did the filtering. F88–F91 therefore fix the
**observable contract** (source shape, race rules, query serialization, status in the view)
and leave the mechanism to an ADR written with 19.1.

This is exactly the pattern spec 05 F82 used for the sanitizer peer, deferring to ADR-0055 —
and that one worked: the spec clause survived unchanged while the mechanism was chosen.

## Three things the spec pins that the roadmap items left open

Writing the requirements surfaced decisions the one-line items had glossed:

1. **The race rule needs an identity check at apply time, not just an abort.** `AbortSignal`
   stops a `fetch`; it cannot un-resolve a promise that already settled in a microtask. So
   "only the load whose signal is still the current one may apply its result" is in the spec
   as the core algorithm, because the naive implementation passes every test written by
   someone who has not hit it.
2. **Select-all under an active filter is a data-loss bug waiting to happen.** "Select all,
   then filter, then act on invisible rows" has shipped in every application that left it
   implicit, so F94 specifies the meaning rather than leaving it to the implementer.
3. **CSV export is a security surface.** A field beginning `=`, `+`, `-` or `@` is a formula
   when the file is opened in a spreadsheet. F96 neutralizes by default, documents it, and
   makes it defeatable — and 19.4's route annotation gained a `security` signal it did not
   have.

## Where the project stands

**M1–M18 complete; v1.0.0 and v1.1.0 released and published on GitHub.** Specs 01–05
delivered, spec 06 now authored. ADRs through 0061, next free 0062. Nothing in flight but
this PR.

**One thing still open, and it is not code:** `publish.yml` has never run, and
`npm view egl-utils-js` still returns 404 — the package has never been published to the
registry. Which means the no-bundler CDN URLs M18 shipped, documented and gated do not
resolve for anyone yet. The blocker is the one-time npm trusted-publisher setup
(`docs/workflow/release.md`), which is the owner's.

## How the next session resumes

1. Wait for this PR to merge.
2. **19.1** — the async source contract, and the first ADR of the wave: adapter versus
   option. Read spec 06 §4 first; it states what the ADR has to decide and what it may not
   change.
3. Everything in this wave lands under NFR-25, so every implementing PR owes the
   surface-inventory diff as evidence, not just green tests.

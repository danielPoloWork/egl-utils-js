# 2026-08-12 — The full error taxonomy reaches the root (roadmap 17.12)

## What got done

- **`DomContractError` and `PeerMissingError` re-exported from the root**, per
  [ADR-0053](../../../adr/0053-the-full-taxonomy-reaches-the-root.md) — closing the drift
  between ADR-0003's "the taxonomy is re-exported from the root" and `index.js` actually
  re-exporting 8 of 10 classes.
- **Spec 01 §5 gets a scope note**, not a rewrite: it now says explicitly that its
  enumeration is F1–F25's original, frozen surface, and points to specs 02–04's own §5
  sections and to the still-open 17.3 (generated API reference) for the current full list.
- **NFR-01's root full-import ceiling amended a second time this milestone**: 6.05 kB
  (ADR-0052, this morning) → **6.1 kB**. The two classes cost 70 B.
- `errors.test.js` gained a test keyed off `/errors`' own export list — every function
  export from that module must also appear on the root, identically — rather than the
  hand-copied assertion list the old test carried. An eleventh class added without a root
  re-export now fails immediately.

## The pattern repeating within one day

This is the second NFR-01 amendment in the same milestone, both from small, "additive"
17.1-review items (17.10 this morning, 17.12 now). Neither review item's own text mentioned
a byte cost — both were framed as placement/documentation decisions — and both turned out to
cost real bytes once measured, because the root full-import ceiling had essentially no slack
left (136 B under the original 6 kB clause before 17.10, 48 B after it). The response is the
same both times: measure, then write the clause the measurement needs (ADR-0015's
precedent), and say so plainly in the size-limit row's own comment rather than leaving a
future contributor to reconstruct why the number is what it is.

Two amendments to the same clause inside one milestone are not evidence the gate is loose —
both were caught and sized in CI before merging, which is the gate doing its job. It is
evidence that the root entry has, for the first time, started absorbing exports that
originated on other entries rather than only growing its own new capabilities — and that
kind of growth was never budgeted for when NFR-01's original 6 kB figure was set.

## Where the project stands

M17 in progress. Merged: 17.1, 17.2, 17.7, 17.8, 17.9, 17.10, 17.11. This PR closes 17.12.
Still open: 17.3, 17.4, 17.5 (stays last), 17.6, 17.13, 17.14 — none block each other. ADRs
through 0053, next free 0054.

## How the next session resumes

1. Wait for this PR to merge.
2. Remaining open items are independent of each other and of this one: **17.3** (API
   reference), **17.4** (the per-function NFR-01 clause — distinct from the aggregate this
   session and 17.10 amended), **17.6** (the `/sanitize` peer contract), **17.13**
   (descriptor-shape option checking), **17.14** (collapse the now-vestigial `#webcrypto`
   shim — worth doing before M18 pins the exports map byte-identical). **17.5** cuts the
   release and stays last.
3. If another root export is added before 1.0, check the NFR-01 aggregate budget explicitly
   rather than assuming headroom — this session and the previous one both found none.

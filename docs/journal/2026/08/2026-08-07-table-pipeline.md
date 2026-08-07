# 2026-08-07 — The table pipeline (13.1)

## What got done

Roadmap **13.1**: `tablePipeline` on the `/table` entry (spec 03 F42) — the wave's flagship
contract, and the reason the tabular wave exists.

- One owner of the row set, one derivation (`source → filters (AND) → search (OR) → sort →
  paginate`), one `'change'` event. Filtering and sorting **compose**; the split-widget
  arrangement they replace could not.
- Commands are transactions: each validates, mutates, and emits exactly one `'change'`
  carrying the derived view — including compound ones (a filter change also returns to page
  1). `batch(fn)` coalesces several into one, and announces even when `fn` throws, because
  the state did change.
- Observation is **delegated, not inherited**: the pipeline holds an `EventEmitter` and
  re-exposes `on`/`once`/`off` bound to it; `emit` stays in the closure, so a subscriber can
  never announce a change the pipeline did not make.
- `view()` is memoized on a version counter — two reads with no command between them return
  the identical object, which is a render guard a subscriber can use with `===`.
- 57 unit tests + 9 property suites (fast-check): composition in either order, one event per
  command, referential memo stability, page always in range, derived rows always a
  subsequence of the source by identity, source never mutated, and totality of the filter
  surface.
- [ADR-0034](../../../adr/0034-one-owner-one-derivation-and-the-pipeline-budget.md);
  patterns catalogue rows 12 (Facade) and 13 (Observer), plus Template Method in *Rejected*.

## Two findings worth carrying forward

**The first implementation met NFR-13 and would still have failed CI.** The 10k-row
derivation measured 45.8 ms against a 50 ms budget — passing, but with p99 at 84 ms and
±12% spread on a fast workstation. Reading each sort key **once per row** instead of once
per comparison (decorate, sort positions, undecorate) took it to **21.1 ms, p99 30.3 ms,
±7%**; the isolated two-key sort fell from 116.6 ms to 38.1 ms. Recorded in
[`docs/benchmarks/2026-08-07-table-pipeline-derivation.md`](../../../benchmarks/2026-08-07-table-pipeline-derivation.md).
The lesson is about *margin*, not speed: a budget met by 8% on a dev machine is not met.

**The same change fixed a trap, not just a number.** In the naive form a column with a
`getValue` callback ran the **caller's** function once per comparison — ~86,000 calls on a
10,000-row sort instead of 10,000. That is the kind of cost a consumer cannot see and
cannot fix from outside.

## Budget: measured, then amended (the 12.1 move again)

`/table` measured **3273 B** against an indicative 3 kB clause, and `{ tablePipeline }`
**3250 B** against an indicative 2.75 kB. Real fat came out first (~80 B: the decorate
rewrite, one shared array assertion, bound emitter methods); what remained was diagnostic
messages and contract behaviour. So the clause was **amended in spec 03 NFR-12 to 3.5 kB**
with the ADR-0034 justification, and the rows pinned at measured+7%.

Note the shape: `{ tablePipeline }` (3250 B) is within 23 B of the whole entry (3273 B) —
a facade that composes all three primitives plus the emitter *is* the size of what it
composes. That is exactly why spec 03 exempts composing facades from the 1 kB per-function
clause. Primitive-only consumers still pay 1714 B, and that scenario row is permanent.

## Where the project stands

M9–M12 complete, v0.5.0 drafted (awaiting publication). **13.1 done; 13.2 is the last item
of spec 03** and of milestone 13. ADRs used through **0034**, next free **0035**.

## How the next session resumes

1. Wait for this PR to merge (one PR at a time).
2. Start **13.2** on `feat/table-dom-bindings`: `bindTableControls` in `/dom`
   (`dom-table.js`) — debounced filter/search inputs, **one** delegated sort-header listener
   reflecting `aria-sort`, pagination enabled/disabled from the derived view, and structural
   teardown through a single `AbortController` (NFR-15 is asserted by counting listener
   attachments, not by inspection).
3. Two things 13.2 owes: `/dom` had only ~14% headroom after 12.2 (3436 B against a 3.68 kB
   row) — `bindTableControls` composes `debounce` + `delegate` + the setters, so measure
   early. And spec 03 §6 still owes a **Playwright case for F50's focus save/blur/restore**
   (12.2 shipped with jsdom coverage only); 13.2 extends the browser suite anyway, so it is
   the natural place to settle it.
4. After 13.2: M13 completes → cut **v0.6.0**, then spec 04 planning (PR #0c) opens the
   Bootstrap toolkit wave.

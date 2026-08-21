# ADR-0061: Served bytes are their own accounting — keyed by entry, not by chunk

- **Status:** Accepted
- **Date:** 2026-08-19
- **Deciders:** Daniel Polo (owner), agent (senior project architect persona)
- **Related:** [spec 05](../specs/05_spec_browser_distribution.md) §2 F86–F87 and §6
  (the F87 clause is amended here), ROADMAP 18.5,
  [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) (the artifact and its
  NFR-22 re-pin, and the brotli-vs-gzip note this inherits),
  [ADR-0060](0060-the-cdn-default-and-what-the-tarball-proves.md) (the CDN default these
  routes are reached through),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure, then pin at
  measured + ≤ 7%), [ADR-0017](0017-platform-api-floor-gate.md) (the
  declared-inventory-plus-verifier shape this copies)

## Context

F87 asks for a gated byte figure per documented no-bundler route: *"the entry file plus its
transitively imported chunks — the real request waterfall a static page pays"*. Spec 05 §6
placed those figures in `.size-limit.json`, beside the 100 rows already there. Two things
make that placement impossible, and the first is not a matter of taste.

**A deep-ESM route is a set of files whose names are content hashes.** `dist/esm/` holds
nine `chunk-<HASH>.js` files, and the hash is derived from the chunk's contents. I appended
one comment line to `errors.js`, rebuilt, and **four of the nine chunks were renamed**;
restoring the file brought the original nine back, so the naming is deterministic — and
deterministically unstable under exactly the edits this project makes every week. A static
row naming `chunk-47ELFAOV.js` would need re-editing on most PRs that touch any source, and
a gate that must be re-pinned constantly is a gate people learn to update without reading.

**A size-limit row measures a different thing, on purpose.** Those rows bundle the entry
through esbuild, tree-shaken to the imports named in the row, then compress the result once.
That models what a *bundler consumer* ships, which is what NFR-01/NFR-02 are about. A static
page pays something else: whole files, no tree-shaking, one compressed response per file.
The gap is not a rounding difference — `/index` is **6 068 B** as a size-limit row and
**13 461 B** as a served waterfall, and `/bootstrap` is 20 290 B against 31 276 B. Quoting
the bundled figure at a no-bundler consumer would understate their cost by half.

## Decision

**1. Served bytes get their own gate, keyed by entry name.** `tools/transfer-budgets.js`
declares one row per documented route — the ten deep-ESM entries plus the artifact — with
its file, its exact request count, its measured bytes and its budget.
`tools/check-transfer-budgets.mjs` resolves each entry's chunk closure from the real import
graph at run time and re-measures on every run. Entry names are stable public API; chunk
names are build output, and nothing hand-maintained refers to them.

This is deliberately the shape [ADR-0017](0017-platform-api-floor-gate.md) established for
the api-floor gate: a declared inventory with the reasoning beside each number, and a
verifier that trusts none of it.

**2. Each file is compressed separately, then summed.** That is what a CDN does with
independent responses, and it is why the served figure exceeds a single-file compression of
the same bytes. Brotli, matching every other size figure in the project (ADR-0059 records
why the metric is brotli even where a clause says "gzip").

**3. The request count is gated exactly, not as a ceiling.** A build change that splits or
merges a chunk changes the number of round trips a high-latency connection pays, even when
the byte total holds. Exact-matching turns that into a deliberate look rather than a silent
pass; the count is one integer to update when the change is intended.

**4. Both accountings are kept.** The size-limit rows stay exactly as they are. The two
answer different questions for different consumers, and deleting either would leave one of
them unmeasured.

**5. Spec 05 §6's F87 clause is amended** to say the figures live in their own gate rather
than in `.size-limit.json`, with the chunk-hash finding as the reason.

## Alternatives Considered

- **Static `.size-limit.json` rows naming each chunk**, as §6 originally specified. Rejected
  on the measurement above: four renames from one comment line. The version of this that
  *would* work — pinning `chunkNames` to a stable pattern in the tsup config — trades a
  build-output detail for cache-busting, since content hashes are what let a CDN serve
  chunks immutably. Breaking caching to simplify a gate is the wrong side of that trade.
- **A `.size-limit.js` config computing the rows at load time.** Size-limit does accept a JS
  config, so the closure could be resolved there and the figures would live where §6 said.
  Rejected: it converts a 100-row hand-written JSON file — whose row *names* carry the prose
  justifying each budget — into generated config, and it buries the served-vs-bundled
  distinction inside a file whose every other row means the bundled thing. Two metrics in
  one file, distinguishable only by how a row was constructed, is worse than two files.
- **Measure the concatenation of the closure, compressed once.** Simpler, and wrong in the
  consumer's favour: it reports a number no browser ever transfers, because compression
  cannot span independent HTTP responses.
- **Gate only the total across all entries.** Cheap, and it would hide the case that
  matters: one entry's waterfall doubling while the sum drifts inside tolerance.
- **Assert the waterfall from Playwright**, counting real requests in the browser. Genuinely
  the most faithful measurement, and rejected as a *gate*: it makes a byte budget depend on
  browser download behaviour, engine caching and network timing, which is how a size gate
  becomes flaky. F86's browser suite proves the routes *work*; this gate proves what they
  *cost*, and the split keeps each one deterministic.

## Consequences

- **`check:package` grows a sixth assertion** (`check:transfer`), and the first that reports
  what a *page* downloads rather than what a *bundler* emits.
- **A finding worth surfacing to consumers:** `/bootstrap` deep-ESM is **31 276 B over 7
  requests**, and the whole single-file artifact is **31 605 B over 1** — within 1%. A page
  that needs `/bootstrap` should prefer the artifact route; the deep-ESM route pays off for
  the smaller entries (`/errors` is 1 074 B, `/net` 1 340 B). The README's route guidance
  now says so with the numbers behind it.
- **Eleven new numbers to re-pin** when they legitimately grow, at measured + ≤ 7% like every
  other budget in the project. The gate prints the drift on every run, so re-pinning is
  reading one line rather than re-deriving.
- **Chunk-graph changes become visible.** The request count is the part most likely to move
  without anyone intending it, and it is now the part that fails loudest.
- **Not covered, and deliberately:** whether a real CDN serves these bytes with these
  headers. That needs a publish, and ADR-0060 already records the same boundary for the CDN
  fields themselves.

## References

- [spec 05](../specs/05_spec_browser_distribution.md) F86, F87 (§6 amended), NFR-22;
  ROADMAP 18.5.
- [ADR-0017](0017-platform-api-floor-gate.md) (declared inventory + verifier),
  [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (measure, then pin),
  [ADR-0059](0059-one-file-one-global-and-a-budget-repinned.md) (the brotli metric).

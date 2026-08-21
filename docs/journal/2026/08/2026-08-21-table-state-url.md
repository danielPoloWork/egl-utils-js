# 2026-08-21 — The URL is the state, and the page goes last (19.2)

## What got done

- **`table-url.js`** — `tableStateToParams` / `tableStateFromParams` (F92), pure and SSR-safe,
  re-exported from the `/table` entry.
- **`dom-history.js`** — `bindTableHistory` (F93) on `/dom`, the only half that knows what
  `history` and `location` are.
- **`TableView` gains `pageSize`** — the read model could already be asked for `pageCount`,
  which is derived from a page size the caller could not read back.
- **65 tests across three files**, one of them a property suite; both new modules at 100% lines,
  branches and functions. Full suite 2512 → **2583**.
- **ADR-0063**, **BUG-0004** (found here, fixed here), six api-floor entries, four F87 transfer
  routes re-pinned, seven size-limit rows moved or added, README section, roadmap **19.8** filed.

## The decision that mattered, and it was not the one I expected

The interesting problem was not the encoding. It was that **`batch` does not do what its name
suggests here.** F42's `batch` makes four commands emit one `'change'`; it does *not* stop each
one from resetting the page to 1, because that reset is a state write inside `commit`, not a
property of the emission. A restore that applied the parameters in the order a URL happens to
list them would have landed on page 1 every time — in one tidy `'change'`, with nothing to see
in the event log.

So the page is applied **last**, and that ordering is the requirement rather than an
implementation detail. Spec 06 F93's phrase "cannot be defeated by the page-reset rule" turned
out to be a bug report written before the bug, and the test for it says so in its name.

Two more traps came with it. A restore **fires the event that writes the URL**, so writing is
suppressed for its duration — otherwise `popstate` would push an entry for the entry the user
just navigated to, and Back would break in a way that looks like the browser's fault. And the
URL is untrusted while the pipeline's key space is **closed**: `?filter.bogus=1` from a link
shared before a column was renamed throws `unknown column`. Obeying F92's degrade-don't-throw
clause in the parser and then throwing in the binding would have honoured the letter and lost
the point, so each filter and sort entry is applied on its own, the refused ones are skipped,
and the normalizing write **removes them from the URL** — a URL that corrects itself is a better
report than a console line nobody reads.

## The property suite found a defect in code it was not testing

`fc.dictionary` generated a filter key called `__proto__`, and the round-trip failed. The new
parser was building its filter map by assignment, which routes through `Object.prototype`'s
`__proto__` setter — so the filter was silently dropped. Fixing that raised the obvious
question about the older code doing the same thing, and `tablePipeline`'s `view()` had the same
line: a column keyed `__proto__` was filtered **for real** and reported by the view as **no
filter at all**. The read model disagreeing with the derivation is the one thing F42's
single-owner design exists to make impossible.

Recorded as BUG-0004, low severity and honestly so — nobody has that column — but the shape of
the failure is worth the record, and the URL feature is what would have made it visible: the
address bar would have described a different table than the one on screen. Not filed as a
security issue: the only values reaching that assignment are filter expressions, and assigning
a string to `__proto__` is a no-op, so there is no path to `Object.prototype` here.

No example test would have written that key. That is the argument for property tests, made by
the tests rather than by me.

## The gate that was watching nothing

The api-floor amendment (NFR-28) was meant to be paperwork: six entries for `history` and
`location`, all with ancient browser floors and a `context` guard because Node has none of
them. Then the negative control — remove an entry, expect the check to fail — **passed**.

`tools/check-api-floor.mjs` strips template literals whole, interpolations included, so
`` `${location.pathname}${location.hash}` `` was invisible to a scan that promises
deny-by-default. Rewriting that one line as plain concatenation made the gate see it, and the
negative control then failed as it should for all three members. The same blind spot covers
optional chaining, which is how `globalThis.location?.protocol` in `storage.js` has gone
unscanned since M6.

Kept my own reads scannable by hand and filed the scanner fix as **19.8** rather than doing it
inside a feature PR — it will surface un-inventoried uses elsewhere, and each one is an
ADR-0017 decision that deserves its own review.

## Measured rather than asserted

- Surface **115 → 118**, run as a diff of live bindings before and after: three additions, zero
  removals, zero changes. That is NFR-25's proof, and it is mechanical.
- `/table` full import 4666 → **5453 B**; `/dom` full import 4990 → **6448 B** — the first row
  to pass ADR-0035's 5 kB clause, knowingly, per NFR-30 as corrected in 19.1. Per-function rows
  are what bound the promise: `tableStateToParams` **780 B**, `tableStateFromParams` **539 B**,
  `bindTableHistory` **1920 B**.
- `{tablePipeline}` alone 3389 → **3397 B**, all 8 bytes of it the BUG-0004 fix. The row had
  11 B of headroom, which is not a margin to ship on, so it is re-pinned rather than squeezed.
- Four F87 routes re-pinned, two gaining a request. `/bootstrap` grew **1427 B without gaining a
  feature** — the third time — because `bsTable` pulls the shared table chunk and that chunk now
  carries the F92 pair as well as `remotePipeline`. The artifact is still cheaper than
  `/bootstrap` over eight requests, so the README's advice stands.
- Also corrected: the README and `maintenance.md` still claimed **113** exports. 19.1 took the
  surface to 115 and did not update either. Now 118.

## Things the implementation corrected about itself

- The bind-time refusal of a predicate filter was, in the first draft, checked *after* the
  restore — where it can never fire, because a restore clears every filter the URL does not
  name. It would have passed its own test by accident and silently discarded the caller's
  filter. Moved before the restore.
- `TableUrlState.filters` was typed `Record<string, string>`, which is what it accepts, and
  `tsc` refused the primary call site: `TableView.filters` is `string | predicate`. Widened to
  the view's own union, with the reason written down — typing it strictly would have moved the
  failure to compile time for the honest caller and done nothing for the plain-JS one.
- Three jsdom tests waited a fixed macrotask for `history.back()`. jsdom takes longer than that,
  and a fixed wait is the 19.1 flake all over again, so they poll for the condition instead.
- A guard around clearing a filter the pipeline had just reported was dead code and would only
  have hidden a broken pipeline. Deleted rather than mock-covered — the M2.4 precedent — which
  is also how both new modules reach 100% branches honestly.

## Where the project stands

v1.1.0 released; **M19: 19.1 and 19.2 done, 19.3–19.8 open**. `.changeset/` holds two minor
entries (19.1's and this one), so the next release is v1.2.0. ADRs through 0063, next free 0064.
Bug ledger through BUG-0004. Every gate green locally, including `check:package`, F87, the
api-floor check and the consistency lint.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **19.3, row selection**, is the next capability item: keyed by `rowKey`, and the requirement
   already names the trap — what select-all means under an active filter has to be *specified*,
   not left to the reader.
3. **19.8** is small, independent, and worth doing before the wave adds more platform APIs:
   F97's clipboard and F98–F100 all need inventory entries, and they should land under a gate
   that can actually see them.

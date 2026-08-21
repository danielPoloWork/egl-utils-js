# ADR-0063: The URL is the state — and the page goes last

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Daniel Polo
- **Related:** [spec 06](../specs/06_spec_table_data.md) §2 F92–F93, §3 NFR-25/NFR-28/NFR-29/NFR-30;
  ROADMAP 19.2; [ADR-0062](0062-a-sibling-not-a-wrapper.md) (the command vocabulary both
  pipelines share, which is what lets one binding drive either),
  [ADR-0034](0034-one-owner-one-derivation-and-the-pipeline-budget.md) (the F42 pipeline,
  its `batch`, and the page-reset rule this ADR has to work around),
  [ADR-0035](0035-the-controls-bridge-and-the-dom-budget.md) (the F51 controls bridge whose
  shape this copies: no state of its own, structural teardown),
  [ADR-0028](0028-dom-entry-fails-fast-and-the-floor-gate-sees-the-dom.md) (the `/dom`
  fail-fast contract), [ADR-0017](0017-platform-api-floor-gate.md) (the inventory this
  amends), [ADR-0045](0045-a-controller-from-the-node-s-own-realm.md) (the cross-realm
  signal trap this binding avoids by not creating it),
  [ADR-0047](0047-unknown-option-keys-are-rejected.md) and
  [ADR-0056](0056-descriptors-are-checked-too.md) (the unknown-key rule, and the one
  documented exception made here), [ADR-0052](0052-one-home-for-a-pure-function.md) (the
  precedent for where a pure function belongs), [BUG-0004](../bugs/2026/08/BUG-0004-view-filters-lose-a-proto-column.md)

## Context

A table's state is the question a user asked — which filters, which search, which sort,
which page — and the URL is the only part of a page they can bookmark, reload, or send to a
colleague. F92 and F93 make that round-trip real. The requirement was written
mechanism-neutral in one place only (which names the parameters), and everything else it
fixes is observable contract: an exact round-trip, unknown parameters preserved, malformed
input degrading rather than throwing, and a restore that applies as **one** transaction.

Four forces shaped the answer, and three of them are traps rather than choices.

**The split is not negotiable.** NFR-29 keeps `egl-utils-js/table` free of DOM references,
and a URL *looks* like data — which is exactly why the requirement calls this out as the
wave where the temptation is real. A server render legitimately reads a request's query
string and derives page 3 before any script exists.

**`batch` does not do what its name suggests here.** F42's `batch` makes several commands
emit one `'change'`. It does **not** stop each command from resetting the page to 1, because
that reset is a state write inside `commit`, not a property of the emission. A restore that
applied page, then filters, then sort — the order the parameters happen to appear in a URL —
would land on page 1 every time, in one tidy `'change'`. The requirement's phrase "cannot be
defeated by the page-reset rule" is a bug report written before the bug.

**A restore fires the event that writes the URL.** Applying the URL emits `'change'`; a
`'change'` handler that writes the URL would push a history entry describing the state it
had just read, and on `popstate` it would push an entry for the entry the user navigated to.
Back would stop working, and it would stop working in a way that looks like the browser's
fault.

**The URL is untrusted, and the pipeline's key space is closed.** `tablePipeline` declared
with `columns` throws `TypeError: unknown column: x` on an undeclared key, and also on a
column marked `filterable: false`. So a hand-edited or stale `?filter.bogus=1` — a link
shared before a column was renamed — would take the page down at bind time. F92 says
malformed input degrades rather than throws; obeying that in the *parser* and then throwing
in the *binding* would have honoured the letter and lost the point.

## Decision

**1. Two functions on `/table`, one binding on `/dom`.** `tableStateToParams(state,
{prefix, base})` and `tableStateFromParams(input, {prefix})` are pure, reach no platform API
but `URLSearchParams`, and are exported from `egl-utils-js/table`.
`bindTableHistory(pipeline, options)` is on `egl-utils-js/dom` and is the only piece that
knows what `history` and `location` are. This is ADR-0035's shape reused: the binding owns
listeners and writes, never state.

**2. The encoding is flat, short, and namespaceable.** `q`, `sort`, `page`, `size`, and
`filter.<column>` per column, each optionally under a `prefix` (`orders.q`,
`orders.filter.status`), so two tables can share one URL. Every default is **omitted** — no
search, no filters, no sort, page 1, no page size are the *absence* of parameters — which is
what gives a table at rest a clean URL and what makes the round-trip exact in both
directions.

Sort repeats as separate `sort` parameters rather than one comma-joined value, and each is
read by splitting at its **last** colon. Both choices exist for the same reason: a column
key is an arbitrary string, and a key containing a comma or a colon must round-trip. The
property suite generates exactly those keys.

**3. The two directions are deliberately asymmetric.** `tableStateToParams` is handed a
state by the program, so a malformed one is a bug and throws — including a **predicate**
filter, which `tablePipeline` accepts and a URL cannot carry. `tableStateFromParams` is
handed a query string by whoever last edited the address bar, so every field degrades on its
own and **nothing throws on the input**: `page=abc` is page 1, `size=0` is unpaginated,
`sort=name:sideways` is dropped while the entries around it survive. Only a wrong argument
*type* is a programming error.

**4. The restore applies in a fixed order, and the page is last.** Inside one `batch`:
clear the filters the URL no longer names, apply the filters it does, set the search, build
the sort, set the page size, and **then** set the page. One `'change'`, and a page that
survives the four commands that would otherwise have reset it.

**5. Writing is suppressed for the duration of a restore**, so applying the URL cannot write
the URL. On bind the restore is followed by exactly one deliberate `replaceState` that
normalizes the address bar to the state actually applied — never `pushState`, because binding
a table is not a navigation.

**6. A refused parameter is skipped, and the URL is corrected.** Each filter and each sort
entry from the URL is applied on its own, in a `try`; the rejected ones are collected and
reported through an optional `onIgnored`. With no callback the skip is **silent but
visible**, because the normalizing write removes the offending parameter — a URL that
corrects itself is a better report than a console line nobody reads. The clearing loop is
deliberately **not** guarded: those keys came out of the pipeline's own view one line
earlier, so a failure there is a broken pipeline, not untrusted input.

**7. `mode` defaults to `'push'`.** F93 asks for Back and Forward to move through table
states, and that is only true if a change pushes. The cost is stated rather than hidden:
every settled control change becomes a history entry, and a page whose filters are typed
rather than chosen may prefer `'replace'` — addressable and shareable either way, simply not
a trail.

**8. `TableView` gains `pageSize`.** The read model could already be asked for `pageCount`,
which is *derived from* a page size the caller could not read back. F92 needs it, and the
remote sibling's view has carried it since 19.1. Additive, and it makes
`tableStateToParams(pipeline.view())` complete.

**9. One documented exception to ADR-0047.** The `state` argument of
`tableStateToParams` **ignores** unknown properties instead of rejecting them, because the
primary call site passes a `view()` — which also carries `rows`, `total`, `totalFiltered` and
`pageCount`. A strict bag there would forbid the one call every consumer makes. Its
`options` bag is strict as usual, as is every bag on the binding. The `filters` type is the
view's own union (`string | predicate`) for the same reason: typing it string-only would
have made the primary call site a compile error while doing nothing about the plain-JS
caller, whom the runtime check serves either way.

**10. No internal `AbortController`.** The `popstate` listener is attached to the injected
window and detached explicitly on teardown. BUG-0003's cross-realm signal trap is avoided by
not creating the hazard rather than by working around it — the injected window may well be
from another realm, which is the whole point of the option.

**11. The api-floor inventory gains six entries** (`history` plus `pushState`,
`replaceState`, `state`, and `location.search`/`pathname`/`hash`), each `guardReason:
'context'` — the floors are ancient on the browser side and absent in Node, which is the
real question for an entry a server render loads. `history` also joins the scanner's
`POLICED` list, so a future `history.anything` cannot enter unseen. `Window.popstate` is
declared by hand, like `EventTarget.addEventListener` before it, because the scanner strips
string literals and cannot see an event name.

## Alternatives Considered

- **One function taking a `URL`, or returning a `URLSearchParams`.** Rejected: `new URL()`
  needs a base, which a relative URL has not got — the same reason `withUrlParams` splits by
  hand (ADR-0030) — and a `URLSearchParams` return would put a platform object where every
  neighbour (`urlSearchParams`, `withUrlParams`) returns a string.
- **Serializing the state as one opaque parameter** — base64 or JSON in `?table=…`. Rejected:
  it round-trips trivially and destroys the only reason the state is in a URL at all. A
  human cannot edit it, a support engineer cannot read it, and a link cannot be assembled by
  hand. It would also make the "preserve unknown parameters" clause meaningless by making
  ours unknowable.
- **No `prefix`, added later if needed.** Rejected, though it was close: adding an option is
  additive and therefore cheap under NFR-25. But without it the *default* names are the only
  names, and two tables on one page — the common case in the applications this library
  serves — silently share `page` and `q`. Fifteen lines now against a design that cannot
  express the second table.
- **Restoring by handing the parsed state to the pipeline in one call.** Rejected: there is
  no such command, and inventing one would change `tablePipeline` — which NFR-25 forbids and
  which ADR-0062 already refused for the same reason.
- **Letting an unknown column throw.** Rejected: it makes every stale link a broken page,
  which is precisely what F92's degrade-don't-throw clause is about. The middle route —
  skip, report, and correct the URL — keeps the failure observable without making it fatal.
- **`mode: 'replace'` as the default.** Rejected as the default while kept as the option: it
  is the quieter behaviour, but it silently declines the requirement. A caller who wants
  quiet asks for it; a caller who reads "history integration" and gets no history was
  misled.
- **Deriving the page size by watching `setPageSize` instead of adding it to the view.**
  Rejected: that is a binding keeping state, which is the one thing ADR-0035 says this layer
  does not do, and it would have been wrong for any pipeline constructed with a page size it
  never saw set.

## Consequences

- **The state is addressable, and the round-trip is proved rather than asserted.** A property
  suite generates states over delimiter-hostile keys — `:`, `&`, `=`, `.`, `%`, and the
  parameter names themselves — and checks `parse(serialize(s))` for every prefix, plus that
  foreign parameters survive value-for-value and that two prefixed bindings never read each
  other.
- **That suite found a defect in code it was not testing.** Its key generator produced
  `__proto__`, and `tablePipeline`'s view had been building its filter map by assignment —
  which routes through `Object.prototype`'s `__proto__` setter. A column keyed `'__proto__'`
  was filtered for real and reported by the view as *no filter at all*. Recorded as
  BUG-0004, fixed here in both places (the view, and the new parser), and covered by a
  regression test where the defect lives. No example test would have written that key.
- **The URL wins on bind.** A pipeline constructed with `pageSize: 25` and bound to a URL
  naming no size becomes unpaginated, because the URL is the whole state and not a patch on
  the current one. Documented, and tested, because it is a consequence a caller has to know:
  put the default in the URL, or accept that the URL decides.
- **A predicate filter and this binding are mutually exclusive**, and the refusal is at bind
  time — checked *before* the first restore, since a restore clears every filter the URL does
  not name and would therefore have discarded the predicate silently. Set one on an
  already-bound pipeline and the same error comes out of the command that set it, because the
  write happens in that command's own `'change'` and the emitter rethrows a lone listener
  failure.
- **Budgets moved, and one clause is now knowingly exceeded.** `/table` full import 4666 →
  5453 B, `/dom` full import 4990 → 6448 B — the first row to pass ADR-0035's 5 kB clause,
  which NFR-30 (as corrected in 19.1) says is restated once at wave end rather than amended
  seven times. Per-function rows are what bound the promise that an individual import pays
  for itself: `tableStateToParams` 780 B, `tableStateFromParams` 539 B, `bindTableHistory`
  1920 B, and `{tablePipeline}` alone still 3397 B — 8 B more than 19.1, all of it the
  BUG-0004 fix. Four F87 transfer routes re-pinned, two of them gaining a request; the
  `/bootstrap` route grew 1427 B **without gaining a feature**, for the third time, because
  `bsTable` pulls the shared table chunk and that chunk now carries the F92 pair too.
- **The gate's own blind spots became visible.** `location.pathname` and `location.hash` were
  invisible to the deny-by-default scan while they sat inside a template literal, because
  `stripNonCode` removes template literals whole — interpolations included. The reads are
  written as plain concatenation so the gate can see them, verified by removing each entry
  and watching the check fail. The scanner weakness is real, applies to optional chaining
  too (`globalThis.location?.protocol` in `storage.js` has never been scanned), and is filed
  as roadmap **19.8** rather than fixed in a feature PR.

## References

- Spec 06 §2 F92–F93 (the requirements), §3 NFR-28 (api-floor amendments are explicit),
  NFR-29 (the Node-safety split), NFR-30 (budgets move per PR).
- ADR-0062 — the shared command vocabulary that makes one binding drive both pipelines.
- BUG-0004 — the defect the F92 property suite surfaced in F42 code.

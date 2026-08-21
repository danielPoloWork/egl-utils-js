---
'egl-utils-js': minor
---

**Table state in the URL** (ROADMAP 19.2, spec 06 F92–F93,
[ADR-0063](docs/adr/0063-the-url-is-the-state-and-the-page-goes-last.md)).

A table's state is the question a user asked — which filters, which search, which sort, which
page — and a URL is the only part of a page they can bookmark, reload, or send to a colleague.

Three additions, no change to anything that already existed:

- **`tableStateToParams(state, {prefix, base})`** and **`tableStateFromParams(input, {prefix})`**
  on `egl-utils-js/table` — pure, SSR-safe, and reaching no platform API but `URLSearchParams`,
  so a server render restores the state from the request's query string and derives page 3
  before any script runs. A `view()` is accepted directly, because it is a superset of the
  state. Parameters the state does not own are **preserved**; defaults are **omitted**, so a
  table at rest has a clean URL.
- **`bindTableHistory(pipeline, options)`** on `egl-utils-js/dom` — restores from the URL on
  bind, writes on every change, restores again on `popstate`, so Back and Forward move through
  table states. `prefix` lets two tables share one URL; `mode: 'replace'` keeps the state
  addressable without leaving a trail. Works with `remotePipeline` too, where a four-part
  restore is **one** request rather than four.
- **`TableView` gains `pageSize`** — the read model could already be asked for `pageCount`,
  which is derived from a page size the caller could not read back.

**Nothing throws on a URL.** `?page=abc` is page 1, `size=0` is unpaginated, a malformed sort
entry is dropped while the ones around it survive, and a parameter naming a column that no
longer exists is skipped and then removed from the URL rather than taking the page down. A
hand-edited link is untrusted input.

**Fixed** ([BUG-0004](docs/bugs/2026/08/BUG-0004-view-filters-lose-a-proto-column.md)): a
column keyed `__proto__` was filtered for real by `tablePipeline` and reported by `view()` as
no filter at all, because the read model was built by assignment. Found by the new
round-trip property suite, whose key generator produces the key no example test would have.

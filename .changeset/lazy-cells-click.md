---
---

Test-suite only (BUG-0001): the browser smoke suite's table-delegation case now clicks a cell
rather than the row, so it no longer depends on how a `<tr>`'s centre point hit-tests — the CI
WebKit build resolved it to the ancestor `<table>`, which Playwright refuses to click through,
leaving the `browser` gate red since roadmap 13.2. No change to the library's behaviour or
public API; delegation worked in every engine throughout.

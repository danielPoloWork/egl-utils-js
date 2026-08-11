---
'egl-utils-js': minor
---

**Breaking:** the 1.x runtime floor is **Node >= 22** and **Safari >= 16.4** (ROADMAP 17.2,
ADR-0050).

Node 18 left maintenance in April 2025 and Node 20 in April 2026, so a 1.x line born against
`>= 18` would promise two runtimes nobody patches — for years, since raising the floor after
1.0 costs a major. The rule applied, and stated so the next raise explains itself: **support
the maintained lines, and make the floor the oldest of them.** That picks 22 today; the CI
matrix becomes 22 / 24 / 26 (oldest maintained LTS, Active LTS, Current), and every workflow
that pinned Node 20 now runs the Active LTS.

The Safari figure moves for a different reason. At 15.4 the claim was four-and-a-half years
wide and **untestable** — Playwright ships one recent WebKit build, which is precisely what
let the `AbortSignal.timeout` defect reach the v0.1.0 review — so 16.4 narrows the gap between
what is promised and what CI can verify. Safari 17.4 was rejected: it would also have let
`anySignal` go, and deleting ~200 B of tested code is the wrong side of the trade that review
already made.

Consequences a consumer sees: `engines` now warns on Node < 22, and the internal
`AbortSignal.timeout` fallback is gone because the platform static covers the whole floor.
That makes the root entry 50 B smaller and returns `httpClient`'s documented budget exception
to its original 1.35 kB — the first change in this project to shrink the budgets rather than
amend them upward.

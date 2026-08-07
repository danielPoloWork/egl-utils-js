---
---

Tooling only (roadmap 13.3, ADR-0036): the benchmark gate now collects every benchmark.
Its report classifier silently discarded any group it could not pair with a baseline
library, so all ten absolute benchmarks — `validateEmail`, `parseDuration`,
`urlSearchParams`, `uuid`, the type guards and the four pipeline cases including the NFR-13
budget — ran on every CI benchmark job and were then thrown away. Classification is now a
total, unit-tested pure function; a benchmark it cannot classify fails the run instead of
dropping out of it; and absolute figures are held to an environment-tagged collapse floor
with their millisecond figures printed on every run. No change to the library's behaviour
or public API.

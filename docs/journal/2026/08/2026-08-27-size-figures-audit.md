# 2026-08-27 — A figure nobody checks, and three gates nobody ran (22.1)

## What got done

- **Every `measured N B` in `.size-limit.json` re-baselined** — 45 of the 66 rows carrying a figure
  were wrong, a dozen of them by 5–8% — and the **10 rows that restate their limit in prose**
  corrected too.
- **17 rows re-pinned** at their own original margins, and **three documented clauses amended** with
  the cause, rather than being silently exceeded (one already was).
- **`pnpm check:size-figures`** — a new gate, with its parse and verdict in a separate tested module
  and its band derived from this audit's own data.
- **`check:global`, `check:packed` and `check:transfer` wired into CI**, where they had never run.
- **[ADR-0082](../../adr/0082-a-figure-nobody-checks-is-prose.md)**, and Milestone 22 opened for the
  work M21 left behind.
- 27 example tests on the new module; 3 347 unit tests green overall.

## The finding, in one row

```
single: bsDropdown (NFR-17 <= 1.25 kB behaviour-wrapper row; measured 1160 B …)
limit: 1.24 kB          ← what CI enforces
actual: 1239 B          ← what the build measures
                        ← one byte of headroom, advertised as seventy-nine
```

The next dependency bump would have failed CI on a component nobody had touched, and the row's own
text would have made that look impossible. `bsScrollspy` had two bytes. `bsPopover` had eight.

## The mechanism is one sentence

**A row is re-pinned only when its limit fails.**

[ADR-0056](../../adr/0056-descriptors-are-checked-too.md) put a descriptor check in front of every
Bootstrap builder and wrapper. Three rows went over and were re-pinned properly, with the cause
written down. Eleven others grew by the same shared cost, stayed under their limits, and kept
advertising the old figures. Then #115 — an esbuild `>=0.28.1` **security** override — moved the
same family again. Every gate stayed green the whole time, because no gate was ever looking at the
figure.

And the figure is not decoration: it is what every ADR quotes, every journal entry diffs against,
and every "+N B for X" in this repository is computed from. In 21.4 I had to measure `main` by hand
before I could attribute a single byte, precisely because the rows could not be trusted. That was
the moment this item became worth doing.

## Two clusters, and a band that is derived rather than chosen

Sorting the 45 drifted rows by percentage produced a clean gap:

| Cluster | Rows | Range | What it is |
|---|---:|---|---|
| jitter | 33 | ≤ 1.6%, ≤ 45 B | a shared chunk re-split around an unrelated change |
| rot | 12 | ≥ 4.7%, up to 8.6% | a real cost that was never recorded |

So the gate fails at **more than 2% and more than 8 B**. The fraction sits in the gap; the byte
floor keeps the smallest row carrying a figure (194 B) from failing on two bytes of jitter, and it
is also what will absorb any difference between this Windows box and the Linux runner. Every drift
is *reported* whatever its size — 21.3's one-byte `bsTooltip` lesson was that small movement is
worth seeing and not worth failing on.

## Re-pinning at the row's own margin, not a blanket +7%

ADR-0015's practice is "measured + **≤** 7%", and the "≤" is load-bearing: `single: tablePipeline`
sits at +1.6% on purpose, so it notices movement. A blanket +7% would have erased that intent and
inflated 17 ceilings by fiat. So each row keeps its own ratio — `bsIcon` re-pins at +2.9%,
`bsScrollspy` at +7.7%.

Where the row's own ratio no longer fitted a **documented clause**, the clause is amended once with
the cause:

| Clause | Was | Now | Forced by |
|---|---|---|---|
| NFR-17 behaviour-wrapper row | 1.25 kB | 1.35 kB | `bsDropdown` 1 239 B, `bsOffcanvas` 1 224 B |
| NFR-17 composite row | 1.5 kB | 1.65 kB | `bsCard` 1 507 B — **already over** |
| `bsBreadcrumb`'s own clause | 1.3 kB | 1.4 kB | 1 295 B, 5 B under it |

`bsCard` is the one that stings: it measured 1 507 B against the 1 500 B clause its own text cites,
and no gate could ever have said so, because the row's limit was set 20 B **above** that clause the
day it was written. A row pinned above its clause is a gate that cannot fail — which is exactly the
reasoning the `/bootstrap` row already records for ADR-0041's 25 kB entry clause, and why that
entry is deliberately left alone here at 368 B under it.

`bsScrollspy` is in the file for the opposite reason: it re-pins to 1.21 kB and stays *inside* the
original 1.25 kB clause. The amendment is forced by two members, not by the family, and the row
says so.

## Then the larger finding

Looking for other gates with the same shape, I read the CI workflow instead of the scripts:

```
package.json  check:package = build + publint + exports + size + shakeable + deps
                            + check:global + check:packed + check:transfer
ci.yml        packaging job = publint, exports, size, shakeable, deps
```

The last three are invoked **only** by `publish.yml`, which is a manual dispatch that has never
run. So F83's global-artifact assertion, F84's packed-file list and F87's served-byte budgets — each
with its own ADR, its own tool and its own committed baselines — had never been enforced on a pull
request. `check:transfer`, whose whole point is that a no-bundler page's cost is invisible to the
bundled rows, has been re-pinned by hand in five consecutive items without CI ever reading it.

All four now run in the packaging job, named per assertion the way the other five are.

## What the tests are for

The gate reads prose with a regular expression, which is [ADR-0064](../../adr/0064-the-gate-that-was-watching-nothing.md)'s
exact failure mode: a regex gate does not go red when it goes blind, it goes green. So the parse and
the verdict live in `tools/size-figures.js` — pure, dependency-free — and the suite asserts the
shapes that must be read (including `measured 1888 B against a 7844 B entry`, where only the leading
figure is that row's own), the shapes that must stay ignored (the 51 ceiling-only rows), both edges
of the band, and, against the live config, that the regex still matches more than 50 rows.

## And then the same defect, one field over

Ten rows open with the house shorthand, where the leading figure **is** the limit restated in prose:

```
single: bsButton (1.9 kB - documented NFR-17 composing row, ADR-0037; measured 1872 B …)
limit: 2.02 kB
```

After re-pinning the limits, all ten contradicted the `limit` beside them — so the gate checks that
too, and **exactly**: two fields of the same object either agree or they do not, and no band is
meaningful there. A clause quoted mid-sentence is deliberately not read as a limit; `bsIcon` sits
under ADR-0037's 1.2 kB ceiling at a 0.98 kB limit, and both numbers are correct.

Writing the test for that found a real bug in the gate, which is the argument for the test in one
line: `.size-limit.json` carries `limit: '2.02 kB'` and size-limit's JSON report carries
`sizeLimit: 2020`. The first version only understood the string, so the contradiction check would
have passed on paper and done **nothing** in the real run — the exact failure ADR-0064 was written
about, reproduced inside the gate built to prevent it.

## After

The tightest row in the file is now `single: tableQuery` at 11 B — 5.4% of a 194 B row, and tight
on purpose. Nothing else is under 2.0%. Before this item, three rows were under 10 B.

No public symbol changed, no behaviour changed, and the published artifact is byte-identical, so
this item carries **no changeset**.

## Next

22.2 is the npm publish — the step no release has ever reached. Between them sits the triage of
`extra-feature.md`, which is a design question rather than a maintenance one and wants its own pass.

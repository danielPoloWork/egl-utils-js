# ADR-0082: A figure nobody checks is prose, and a gate nothing invokes is not a gate

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Daniel Polo
- **Related:** ROADMAP 22.1; [ADR-0015](0015-final-size-budgets-and-the-httpclient-exception.md) (the
  "measured + ≤ 7%" practice these rows implement),
  [ADR-0037](0037-builder-contract-nodes-escape-and-the-atom-budget.md),
  [ADR-0038](0038-composites-compose-and-what-a-frozen-constant-costs.md),
  [ADR-0042](0042-ids-are-the-accessibility-and-a-ceiling-derived-not-guessed.md),
  [ADR-0043](0043-three-shapes-that-are-not-a-group.md),
  [ADR-0044](0044-a-second-peer-one-sanitizer-and-a-catalogue-closed.md) (the per-row clauses amended
  here), [ADR-0056](0056-descriptors-are-checked-too.md) (the shared cost that started the rot),
  [ADR-0058](0058-the-per-function-budget-keeps-its-exceptions-named.md) (a budget exception is named,
  measured and ADR-documented — which is why this amendment exists at all),
  [ADR-0061](0061-served-bytes-are-their-own-accounting.md) (F87, one of the gates nothing
  invoked), [ADR-0064](0064-the-gate-that-was-watching-nothing.md) (a regex fixed without a test is only
  the next blind spot — why the parse here is a separate, tested module)

## Context

Every row in `.size-limit.json` carries two numbers:

```json
{
  "name": "single: bsDropdown (NFR-17 <= 1.25 kB behaviour-wrapper row; measured 1160 B …)",
  "limit": "1.24 kB"
}
```

The **limit** is enforced by CI. The **measured figure inside the name** is enforced by nothing —
and it is the one every budget conversation in this repository actually reads: an ADR quotes it, a
journal entry diffs against it, and the next item's "+N B for X" is computed from it.

At v1.4.0, an audit of all 117 rows found **45 of the 66 that carry a figure were wrong**, a dozen
of them by 5–8%. The mechanism is a single sentence: **a row is re-pinned only when its limit
fails.**

[ADR-0056](0056-descriptors-are-checked-too.md) put a descriptor check in front of every Bootstrap
builder and wrapper. Three rows went over their limits and were re-pinned with the cause written
down, exactly as the practice requires. Eleven others grew by the same shared cost, stayed under
their limits, and kept advertising figures from before. Then #115 — an esbuild `>=0.28.1` security
override — moved the same family again. Nothing failed. Nothing was recorded.

**The consequence was not cosmetic.** `single: bsDropdown` measured 1 239 B against a 1 240 B
limit: **one byte** of headroom, while its own text claimed 79 B of margin. `bsScrollspy` had two.
`bsPopover` had eight. The next dependency bump would have failed CI on components nobody had
touched, and the rows would have made that look impossible. `single: bsCard`, meanwhile, measured
1 507 B against the **1 500 B clause it cites** — already breached, unreportably, because its own
limit was set 20 B above that clause the day the row was written, at +7.2% of a figure that
was correct then.

The audit then found a second defect of the same species, and a larger one. `pnpm check:package`
runs ten assertions. **CI's packaging job does not run `check:package`** — it runs five of them by
name. The other three, `check:global` (F83), `check:packed` (F84) and `check:transfer` (F87), are
invoked only by `publish.yml`, which is a manual dispatch that **has never run**. Three gates,
each with its own ADR and its own tool, had never been enforced on a pull request.

## Decision

**1. The declared figure becomes a gate.** `pnpm check:size-figures` reads size-limit's own JSON
report and compares every declared figure against what the build measures. It is wired into the
CI packaging job, and into `check:package` beside the others.

**2. The band is derived from the audit, not chosen.** The measured drift fell into two clusters
with a clear gap between them:

| Cluster | Rows | Range |
|---|---:|---|
| jitter — a shared-chunk re-split on a row whose source never changed | 33 | ≤ 1.6% and ≤ 45 B |
| rot — a real cost that was never recorded | 12 | ≥ 4.7% (up to 8.6%) |

So a row fails when it drifts **more than 2% and more than 8 B**. The fraction sits in the gap; the
byte floor keeps the smallest row carrying a figure (194 B) from failing on two bytes of the same
jitter, and it is also what absorbs any difference between the machine a figure was measured on and
the Linux runner that checks it. Every drift is *reported* whatever its size — the 21.3 lesson,
where one frozen constant moved an untouched row by exactly one byte, was that small movement is
worth seeing and not worth failing on.

**3. Each row is re-pinned at its own original margin, not a blanket +7%.** ADR-0015's practice is
"measured + **≤** 7%", and several rows use much less on purpose: `single: tablePipeline` sits at
+1.6% precisely so it notices movement. Restoring each row's own ratio keeps that intent, and it
keeps this audit from inflating 17 ceilings by fiat.

**4. Where the original margin no longer fits a documented clause, the clause is amended once —
with the cause — rather than silently exceeded.** A row pinned above its own clause is a gate that
cannot fail, which is the reasoning the `/bootstrap` row already records for ADR-0041's 25 kB entry
clause. Three amendments:

| Clause | Was | Now | Forced by |
|---|---|---|---|
| NFR-17 behaviour-wrapper row (ADR-0042 vocabulary) | 1.25 kB | **1.35 kB** | `bsDropdown` 1 239 B, `bsOffcanvas` 1 224 B |
| NFR-17 composite row (ADR-0038) | 1.5 kB | **1.65 kB** | `bsCard` 1 507 B — already over |
| `bsBreadcrumb`'s own composite clause (ADR-0038) | 1.3 kB | **1.4 kB** | 1 295 B, 5 B under it |

The cause is the same in all three: ADR-0047's option-key contract and ADR-0056's descriptor checks
added a **shared** per-builder cost after those clauses were sized, and the esbuild 0.28 override
added a few percent more. `bsScrollspy` is called out in its row for the opposite reason — it
re-pins to 1.21 kB and stays *inside* the original 1.25 kB clause, so the amendment is recorded as
forced by two members rather than by the family.

`/bootstrap`'s entry row is deliberately **not** touched: it measures 24 632 B against ADR-0041's
25 kB clause with 368 B left, and that clause binds first by design.

**5. The three uninvoked gates run in CI.** `check:global`, `check:packed` and `check:transfer` are
added to the packaging job as their own steps, next to `check:size-figures`. Listing them by name
rather than switching the job to `check:package` keeps the CI log readable per assertion, which is
how the other five are already written — but the duplication between the job and the script is now
the thing to watch, and it is why each step names the requirement it enforces.

**6. The gate also checks the limit a row restates in its own words.** Ten rows open with the house
shorthand — `single: bsButton (2.02 kB - documented NFR-17 composing row, …)` — where that leading
figure **is** the limit, restated in prose. All ten disagreed with the `limit` beside them after this
re-pin, which is the same defect one field over, and it is checked **exactly** rather than banded:
two fields of the same object either agree or they do not. A clause quoted mid-sentence ("NFR-17
<= 1.2 kB per ADR-0037") is deliberately *not* read as a limit — it is a ceiling the row sits under,
and conflating the two would make the gate demand the wrong number.

**7. The parse and the verdict are a separate, tested module.** `tools/size-figures.js` is pure and
dependency-free; `tools/check-size-figures.mjs` is the I/O around it. This is ADR-0064's shape and
its reasoning: the gate reads prose with a regular expression, and the failure mode of a regex gate
is passing for a question it stopped asking. The suite asserts the shapes that must be read
(including a row quoting two figures, where only the leading one is this row's own), the shapes
that must stay ignored (the 51 ceiling-only rows), both edges of the band, and — against the live
config — that the regex still matches more than 50 rows, so the gate cannot go blind while staying
green.

## Alternatives Considered

| Option | Why not |
|---|---|
| **Just correct the 45 numbers** | Correct for a day. The mechanism that rotted them is untouched, and the next `check:package`-only gate rots the same way. |
| **Require exact equality** | A shared-chunk re-split moves unrelated rows by a byte or two, so every PR would re-pin rows it did not touch — and a gate people re-pin blindly is worse than no gate (ADR-0061's own reasoning for keying transfer routes by entry name). |
| **Move the figure into a structured `measured` field** | Tested first: size-limit refuses unknown keys (`Unknown option *measured* in config`). And the prose is what humans read, so keeping the gate on the prose is the version that keeps the *documentation* honest rather than a parallel field beside it. |
| **Re-pin every row to measured + 7%** | Inflates 17 ceilings at once and erases the deliberate tightness of rows like `tablePipeline`. The clause amendments would then be larger than the evidence supports. |
| **Raise the failing rows' limits and leave the clauses alone** | Exactly how `bsCard` came to sit 20 B above the clause it cites. A row above its clause cannot fail, which makes the clause decoration. |
| **Switch CI's packaging job to `pnpm check:package`** | One line, and it hides ten assertions behind one green check. The five existing steps are named for a reason; the four new ones follow it. |

## Consequences

- **17 rows re-pinned, 45 figures corrected, 10 restated limits corrected, 3 clauses amended.** After the re-pin the tightest row
  in the file is `single: tableQuery` at 11 B (5.4% of a 194 B row, deliberately tight); nothing
  else is under 2.0%. Before it, three rows were under 10 B.
- **Four more assertions run per pull request.** `check:size-figures` costs one extra size-limit
  run in the packaging job (~25 s), which is the price of the figure being checkable at all;
  `check:transfer` re-uses the build already in that job.
- **The gate can now fail on a legitimate change**, and that is the point: a PR that grows a
  component beyond the band must re-pin the figure and write the cause into the row — the practice
  ADR-0015 and ADR-0058 already asked for, now enforced instead of remembered.
- **No public symbol changes**, no behaviour changes, and no published-artifact bytes change; this
  is documentation and gating only, so it carries no changeset.

## References

- `tools/size-figures.js`, `tools/check-size-figures.mjs`,
  `src/test/javascript/it/d4np/utils/size-figures.test.js`
- `.size-limit.json`, `.github/workflows/ci.yml` (packaging job)
- [ADR-0056](0056-descriptors-are-checked-too.md) — the shared cost, and the three rows that were
  re-pinned while eleven were not
- [ADR-0061](0061-served-bytes-are-their-own-accounting.md) — F87, uninvoked in CI until now

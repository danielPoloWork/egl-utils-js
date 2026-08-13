# 2026-08-13 — The per-function budget clause, closed (roadmap 17.4)

## What got done

- **Spec 01 NFR-01's per-function clause is closed**, per
  [ADR-0058](../../../adr/0058-the-per-function-budget-keeps-its-exceptions-named.md): it stays
  `≤ 1 kB` unqualified, and a function that composes another public export and cannot meet it
  takes a **named, measured exception row documented by ADR in its landing PR**.
- ADR-0015's dangling sentence — *"whether to accept the exception permanently, amend NFR-01 to
  exempt composing facades, or require a redesign is the owner's call"* — is answered rather than
  carried into 1.0.
- `httpClient`'s size-limit row now names the rule as well as its origin. No code, no budget
  moves, no new gate.

## The decision was the owner's, and the evidence was mine to produce

The item is explicitly *"written down as the owner's call"*, so the work here was to make the
call cheap and well-posed: measure everything, enumerate the options with their consequences,
recommend one, and ask. The owner chose **named exceptions**.

## Measuring first corrected the item's own premise

The roadmap said: *"practice has amended it four times over (`httpClient`, `bsTable`,
`tablePipeline`, `bindTableControls`)"*. That reads as a clause overwhelmed by exceptions. It is
not what the numbers say, and the four names are **governed by four different clauses**:

| Clause | Rows over 1 kB | What it says |
|---|---:|---|
| **NFR-01** (root) | **1** — `httpClient` | "any single function ≤ 1 kB", unqualified |
| NFR-08 (`/text` `/net` `/table` `/logging`) | 3 | 1 kB **+ named exception rows, ADR-0015-style** |
| NFR-12 (`/dom`) | 3 | 1 kB for plain functions; F42/F49/F50/F51 exempt by enumeration |
| NFR-17 (`/bootstrap`) | 22 | class ceilings — **no 1 kB clause at all** |

On the entry NFR-01 actually governs, **27 of 28 functions comply**, and the largest compliant
(`retry`, 767 B) is 25% clear of the ceiling. The distribution runs 15 B → 767 B, then jumps to
`httpClient` at 1310 B. There is no cluster pressing against the line.

That reframed the question completely. "Four amendments" argues for relaxing the clause; "one
exception in twenty-eight, with everything else 25% clear" argues that the clause is a live
constraint doing real work, and that exempting a category to accommodate one member retires it
for nothing. The ceremony *is* the mechanism — an ADR per exception is what has kept the count at
one for six milestones.

The second finding sealed it: **the chosen rule is not new.** Spec 02 NFR-08 already states it
verbatim — *"a composite that cannot meet 1 kB takes a named, measured exception row documented
ADR-0015-style"* — and names two under it, both citing ADR-0015's composition argument. So 17.4
is not inventing a policy; it is writing into the one clause that lacked it the rule the clause
next door has stated for three waves. Which is precisely what the item asked for: *a 1.0 should
ship the clause it actually enforces.*

## What I did not do, and why the ADR says so out loud

Once the table above existed, unifying all four clauses was tempting. I did not, and recorded
why: NFR-12's exemption and NFR-17's class ceilings were each decided by their own ADRs (0031,
0034, 0035, 0037, 0040) for reasons specific to components and builders. Reopening four accepted
decisions to make a table look tidy is not what 17.4 asked for.

One distinction worth keeping straight, because it is what makes the divergence defensible rather
than sloppy: **NFR-12's exemption is a closed list, not an open category.** It names four
F-items, each with its own ceiling and ADR. A future `/dom` component inherits nothing from it.
That is materially different from the "exempt composing facades" wording rejected for NFR-01,
which would have been a door rather than a list.

The ADR states all of this in a section headed so a reader cannot mistake the record for tidier
than it is. Four clauses answering different questions about different kinds of symbol is a
defensible state; four clauses that *look* unified but are not would be a trap.

## Where the project stands

**M17 has one item left: 17.5, which cuts v1.0.0.** No decision-heavy work remains. ADRs through
0058; next free 0059. Eight changesets queued, `[Unreleased]` spanning five breaking changes.

## How the next session resumes

1. Wait for this PR to merge.
2. **17.5** is the release, and per AGENTS.md §11 the agent bumps the version, rolls the
   changelog, drafts the notes; the owner opens/merges the release PR and publishes. Sequence
   constraints worth re-reading before starting: the v0.1.0 review's §1.3 recorded that the
   consistency lint asserts the newest `docs/changelog/vX.Y.Z.md` equals `version.js`, so the
   prose cannot be written before the changeset bump lands — it was a two-PR sequence then and
   will be again.
3. The compatibility statement 17.5 calls for has real content: the Node 22 / Safari 16.4 floor,
   option *and* descriptor strictness, the naming freeze, the instance contract, the sanitizer
   peer, and the exports-map simplification.
4. **Still pending from 17.3**, and it should land before the release so 1.0 publishes its docs:
   `gh api -X POST repos/danielPoloWork/egl-utils-js/pages -f build_type=workflow`.

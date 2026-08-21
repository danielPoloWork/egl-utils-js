# 2026-08-21 — The gate that was watching nothing (19.8)

## What got done

- **`tools/api-floor-scan.js`** — the floor gate's check-3 scanner, extracted from
  `check-api-floor.mjs`, pure and dependency-free: `codeOf`, `platformUses`, `POLICED`.
- **`api-floor-scanner.test.js`** — **22 tests**, and the actual deliverable of this item.
- Template literals keep their interpolations; optional chaining is a member read; a computed
  key is refused. `location.protocol` inventoried (38 entries). 19.2's workaround removed.
- **ADR-0064**; roadmap 19.8 checked. No changeset: nothing user-visible changed.

## Why this was not a two-regex fix

19.2 found the blind spots by running the control that ought to be routine — delete an
inventory entry, expect the gate to fail — and watching it pass. Two shapes were invisible: a
member read inside a template literal (the old `stripNonCode` blanked template literals whole,
interpolations included) and a member read through optional chaining (the pattern needed a bare
`.`).

The second is the worse of the two. Optional chaining is the *recommended* way to read a
possibly-absent global, which makes it the shape most likely to appear in exactly the guarded
code the gate exists to check. `globalThis.location?.protocol` has been in `storage.js` since
M6, and `location.protocol` was never inventoried because nothing ever asked for it.

Fixing two regexes would have left the property that caused the bug — **an unverified
scanner** — exactly as it was. This scanner has now been found blind twice, by different waves,
three milestones apart: ADR-0028 wrote "the gate would be weakest exactly where it is needed
most" about DOM types in M11, and it was true again in M19 about a different syntax. So the
deliverable is the test suite: every evasion asserted as *seen*, and — the half that keeps the
gate usable — every shape that must stay ignored asserted as ignored, because comments and
strings in this repository are full of platform names.

The suite paid for itself inside the PR. The first draft of the computed-access pattern allowed
`?[` instead of `?.[` — a one-character-short mistake of exactly the same species as blind spot
#2 — and matched nothing real. The test failed on it.

## The tokenizer, and why not an AST

Keeping `${…}` while dropping literal text cannot be done with a regex, because interpolations
nest: an object literal inside a `${}` inside a template inside another `${}` is legal, and no
regex can tell that inner `}` from the one closing the interpolation. A brace depth per frame
can, in about sixty lines, and regular-expression literals came along for the ride.

An AST would be strictly better and was rejected on dependency grounds: the only parsers in the
tree are transitive and expose no AST as public API, and a repository whose headline claim is
zero runtime dependencies needs more than sixty lines of savings to take a direct parser
dependency. Worth revisiting the day the scan needs *scope* analysis — the one thing a tokenizer
genuinely cannot do, and the reason the gate now documents which false positives it accepts.

## What it found, and what it still cannot see

One real finding across all of `src/main`: `location.protocol`, now inventoried with the guard
it has always had (read inside a `try` off optional chaining, where absent-or-throwing means
not-HTTPS, which is the safe default for local development, ADR-0011). That the fix surfaced
exactly one entry is the reassuring result — the gate was blind to a syntax, not to a habit.

Written down rather than left to be discovered: the scanner sees `view.history.pushState` as
the global, because a text scanner cannot tell an injected window from the ambient one, and it
sees an unrelated object's `history` property the same way. Both are accepted costs, asserted as
tests: a false positive costs one inventory entry with an honest note, a false negative costs a
function broken on a browser the spec promises. Those prices are not comparable. And an event
name is a string, so `Window.popstate` stays hand-declared — permanently, and now for a stated
reason rather than by omission.

## Housekeeping worth noting

Restoring the interpolated form in `dom-history.js` moved three size figures by single digits
(`/dom` −4 B, `{bindTableHistory}` −3 B, the F87 artifact route +60 B). No limit moved and no
baseline was re-pinned: a 7 B drift is the signal the `measured` field carries, and erasing it
on every trivial change is the same mistake as an un-updated budget, pointing the other way.

## Where the project stands

v1.1.0 released; **M19: 19.1, 19.2 and 19.8 done, 19.3–19.7 open**. `.changeset/` holds two
minor entries (19.1's and 19.2's), so the next release is v1.2.0. ADRs through 0064, next free
0065. Bug ledger through BUG-0004. 2605 tests, every gate green locally.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **19.3, row selection** (spec 06 F94–F95) is the next capability item. The requirement names
   its own trap: what select-all means under an active filter must be *specified*, not left to
   the reader.
3. The remaining wave items add platform APIs — F97's clipboard, and whatever F98–F100 need.
   They now land under a gate that can see them, which is what made 19.8 worth doing first.

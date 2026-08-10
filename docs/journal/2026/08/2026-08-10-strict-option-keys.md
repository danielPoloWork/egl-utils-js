# 2026-08-10 — An unknown option key is a TypeError (17.7)

## What got done

- **The 17.7 decision, made and applied.** An unknown own-enumerable key in any options bag
  is now a `TypeError` naming it, across **all 52 bags on all ten entries** — nested bags
  (`bsToast.show`, `inlineAlert.show`, `loadingOverlay.focus`) and `cookieHelper`'s attribute
  bags included. [ADR-0047](../../adr/0047-an-unknown-option-key-is-a-typeerror.md).
- **`option-keys.js`** holds the whole rule: one helper, `assertNoUnknownOptions(unknown,
  api, noun?)`. `commonOptions`/`commonNodeOptions` in `bootstrap-elements.js` split the
  shared F52 contract keys off a builder's rest element and return them in the shape
  `resolveDocument`/`applyClasses`/`renderContent` already read, so **no helper signature
  changed** to accommodate the check.
- **`option-keys.test.js`** — 67 tests, a sweep over every options-taking entry point plus
  the escape hatches and the boundaries.
- Spec 01 NFR-01 and spec 02 NFR-08 amended with the measured cost; 17 of 98 size rows
  re-baselined; ROADMAP 17.7 checked and **17.13 filed**; patterns catalogue records
  *Specification* as rejected; README, CHANGELOG, changeset, entry module docs.

## The design decision, and why it went the way it did

The obvious implementation is a per-function list of accepted keys, validated by a shared
checker — the *Specification* pattern. It is also wrong here, for a reason worth keeping:
**a hand-maintained list is a second source of truth, and it fails open.** Add an option,
forget the list, and the new option reads as unknown; remove one, forget the list, and it
stays accepted. The list would also cost real bytes, because key names in an array literal
survive minification.

The destructuring pattern a function already writes *is* its accepted set. So:

```js
const { variant = 'secondary', pill = false, positioned = false, ...rest } = options;
const common = commonOptions(rest, api);
```

Exact by construction, and it compiles away. That is the whole idea, and it is the sentence
worth carrying to 17.13.

**Development-only strictness was the tempting middle route and had to be rejected**: a
library that commits to working with no bundler and no `process.env` (spec 05) has no
reliable development signal, so "strict in dev" would in practice mean *no check where
consumers ship*.

## What the check found the moment it existed

Three silent key-drops, in this repository's own code and tests:

1. **`bsTable` → `bsPagination`** — the whole controls config was spread into the pager,
   `status`/`statusClass` included, which are not pager options. Fixed by separating the two
   bags explicitly.
2. **The node-safety suite passed `{document}` to `bsAlert`** — an option `bsAlert` has never
   accepted. The test asserted foreign-realm safety while the option it passed was being
   dropped; the assertion held for a different reason (the F49 engine reads the container's
   `ownerDocument`).
3. **Same suite, same key, to `bsPagination`** — likewise.

None was a user-visible bug. All three are exactly the failure mode the review named: a key
that looks configured and is not.

It also surfaced an option-surface inconsistency for 17.8/17.9 to weigh: `bsToast` takes a
container **and** a `document` override, while `bsPagination` and `bsTable` take a container
and no override at all.

## The cost, and the honest part of it

The byte cost is a **shared floor** — the same phenomenon ADR-0037 measured for the F52
contract. A single-function import carries the whole helper, so those rows moved most:
`bsCloseButton` 763 → 835 B. Whole-entry rows barely moved: `/bootstrap` 19163 → 19805 B
inside a 20.5 kB row, root 5806 → 5914 B inside NFR-01's 6 kB ceiling.

Two rounds of measurement changed the design. The first message named **every** unknown key;
that cost ~25 B per import and pushed **eight** documented clauses past their numbers,
including three component/builder ceilings. Naming only the first key brought it to
**zero** component and builder clause breaches — so `bsCard`, `bsPagination`, `bsModal`,
`bsDropdown`, `bsScrollspy`, `bsToast` and `inlineAlert` all stayed inside their NFR-12 and
NFR-17 clauses. Four documented *exception* figures still grew (`httpClient` 1.35 → 1.4 kB,
`comparator` 1.05 → 1.1, `logger` 1.45 → 1.5, `/storage` 2.1 → 2.15) and `compileFilter`
took a new named one at 1.03 kB — ten bytes over its 1 kB clause, all of it this check.

That is a UX trade taken for bytes, and it is stated as one rather than dressed up: with two
typos in one bag you learn the first, fix, re-run, learn the second.

## Where the project stands

M17: 17.1 and 17.7 done, 17.2–17.6 and 17.8–17.13 open. `.changeset/` holds one minor
changeset, `[Unreleased]` has the breaking-change line. ADRs through 0047, next free 0048.
Every gate green: 2280 tests, 100% lines / 99.28% branches, all 98 size rows, publint, attw,
agadoo, zero-deps, TypeDoc, api-floor, consistency lint.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **17.8** is next by the review's order, and it now has a safety net: with 17.7 landed, a
   renamed option surfaces as `TypeError: unknown option 'autoHideMs'` rather than as
   configuration that quietly stopped applying. Renaming without that would have been the
   wrong sequence.
3. **17.13** is the natural companion to this work and is deliberately *not* urgent: the same
   question for descriptor shapes (column definitions, carousel items), on a per-item code
   path whose cost has to be measured before it is adopted.

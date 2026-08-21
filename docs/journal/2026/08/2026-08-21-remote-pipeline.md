# 2026-08-21 — The remote pipeline, and the wrapper that would have been wrong (19.1)

## What got done

- **`src/main/javascript/.../table-remote.js`** — `remotePipeline` (F88–F91) and `tableQuery`
  (F90), re-exported from the `/table` entry.
- **29 unit tests** plus **a property suite** for NFR-26's race invariant.
- **ADR-0062**, the decision this item existed to make; **spec 06 NFR-30 corrected**; size
  rows re-pinned; README section, changeset (minor), CHANGELOG, ROADMAP 19.1 checked and the
  spec-06 coverage glyphs advanced.

## The decision: a sibling, not a wrapper

Spec 06 §4 named this and refused to make it — adapter versus option on `tablePipeline`.
Both looked defensible on paper. What settled it was working out what each one's *worst* day
looks like.

The attractive design is a binder: keep the caller's `tablePipeline`, watch its `'change'`,
serialize the state, fetch, and hand the rows back with `setSource(rows)`. It reuses key
validation, the batch counter, the observer surface — everything.

And it is exactly wrong. The server returns page 3: twenty rows, already filtered and sorted.
`setSource` hands them to a pipeline whose whole job is to filter, sort and paginate — so it
derives *again* over the twenty. The user sees page 1 of a re-filtered subset of an
already-filtered page. Nothing throws. The rows look plausible. That is not a bug found in
review; it is a bug found months later by someone noticing a total that never matches the
list.

So `remotePipeline` owns its own state and shares only the **vocabulary**: same command
names, same argument shapes, same page-reset rule. The duplication is about eighty lines and
it is the price of a design whose misuse is impossible rather than merely discouraged.

`tablePipeline` is untouched — same file, same tests, same measured size, same frozen spec
clause. Which is NFR-25 doing its job: the constraint that looked like paperwork in the
planning PR is what ruled out the design that would have been chosen otherwise.

## The rule the tests exist to defend

`AbortSignal` stops a `fetch`. It cannot un-resolve a promise that already settled in a
microtask. So aborting a superseded load is necessary and **not sufficient** — the result can
still arrive, and something has to refuse it. That something is an identity check at apply
time: each load carries a token, and only the load whose token is still current may write to
the view.

I did not want to take that on trust, so the property suite generates command scripts and
settles the outstanding responses in generated orders, including responses to already-aborted
loads, out of order, with failures mixed in. The invariant is one line: whatever rows are on
screen were produced by exactly the query the same view reports.

**Then I removed the identity check to see it fail.** It failed after **one** case, with a
minimal counterexample. A green property test that has never been seen red is a decoration.

## Three things the implementation corrected about itself

1. **The first draft called `load` on a microtask** (`Promise.resolve().then(() => load(…))`),
   which meant the request was not observable — or abortable — until after the command
   returned. Every test failed on an empty `calls` array, which is the cheap version of the
   lesson: it is called synchronously now, with a try/catch for a synchronous throw.
2. **A malformed result would have become an unhandled rejection.** Validating inside the
   success handler throws into a promise nobody holds; with
   `dangerouslyIgnoreUnhandledErrors: false` that is a test failure, and in production it is
   a silent one. The validation is in a try/catch and a bad shape lands in `error` like any
   other failure.
3. **A stray character** made it into a message string. Caught by re-reading, not by a tool.

## What it costs, measured

- `/table` full import: **3 291 B → 4 666 B** (+42%), re-pinned to 4.95 kB.
- `{ tablePipeline }` alone: **3 389 B, unchanged** — a consumer who does not import the new
  export pays none of it. That is NFR-02 measured rather than asserted, and it is the number
  that makes the +42% acceptable.
- `{ compileFilter, comparator, paginate }`: 1 714 B → **1 786 B**. 72 B of re-export wiring
  that a partial import does not use. Small, real, and recorded in the row's own name rather
  than rounded away.
- Surface: **113 → 115 bindings, root unchanged at 38.** Additions only — NFR-25's proof, run
  as a diff rather than claimed.

## The bill the no-bundler consumer got, which I did not expect

`check:package` failed on the F87 transfer gate, and the failure was worth more than the
feature: **`/table`'s no-bundler route grew 6 751 → 8 461 B**, and **`/bootstrap` grew
31 276 → 32 979 B without gaining a feature at all**.

The second one is the interesting number. `bsTable` pulls the shared table chunk, and that
chunk now carries `remotePipeline` — so a page loading `/bootstrap` over deep ESM downloads
~1.7 kB it will never call. A bundler shakes it away (the `{tablePipeline}` row is unchanged
at 3 389 B); a static page downloads whole files. That is the deep-ESM trade, and F87 exists
precisely so it shows up as a red build rather than as nothing at all.

It also flipped a claim in the README. The artifact route is now **cheaper** than
`/bootstrap`'s deep-ESM route — 32 706 B in one request against 32 979 B in seven — where
M18 measured it as "within 1%". The route-cost table and the advice above it are updated;
the v1.1.0 release notes keep the numbers they shipped with, because those were true then.

Three routes re-pinned, the rest byte-identical. The artifact now sits **894 B under**
NFR-22's pinned ceiling, which the next M19 item will very likely have to amend — flagged
here so that amendment is expected rather than discovered.

## A spec clause of mine that was wrong

Spec 06 NFR-30 said the entry ceilings would be "re-derived once at the end of the wave
rather than amended per item". That is not implementable: the size gate runs on **every** PR,
so an entry row left at its pre-wave number simply fails the first item that grows it. I
wrote it eight hours ago and it survived exactly one contact with the build.

Corrected in this PR rather than quietly violated — the rows move per PR, and what gets its
final figure once at wave end is the spec-03 NFR-12 **prose clause**, which is what the
sentence was actually reaching for.

## Where the project stands

M1–M18 complete, v1.1.0 released. **M19 in progress: 19.1 done, 19.2–19.7 open.** Specs
01–06 authored. ADRs through 0062. `.changeset/` holds one minor. Two verified Dependabot PRs
(#113 eslint 10, #65 Playwright) still open and mergeable.

Still true, still not code: `publish.yml` has never run and `npm view egl-utils-js` returns
404.

## How the next session resumes

1. Wait for this PR to merge.
2. **19.2** — pipeline state ↔ URL (F92–F93). It builds directly on `tableQuery`: the query
   object this item introduced is what the query string round-trips. Two things the spec
   already pins and the implementation must honour: unknown query parameters are
   **preserved**, and a restore applies as **one** batch — four restored commands firing four
   `change`s would land back on page 1, and `remotePipeline` would issue four loads.
3. 19.2 also brings the wave's first api-floor amendment (`history.pushState`/`popstate`),
   which is an explicit ADR-0017 inventory decision, not a silent addition.

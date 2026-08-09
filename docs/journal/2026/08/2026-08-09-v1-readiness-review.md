# 2026-08-09 — The v1.0.0 readiness review (17.1)

## What got done

- **`docs/releases/v1.0.0-readiness-review.md`** written — the 17.1 audit of the whole
  public surface against one question: *after 1.0, which of these could we no longer change
  without a major?*
- **Six items filed** in M17 (17.7–17.12) from the findings, per AGENTS.md §10 and the 7.6
  precedent. Nothing was folded into the review; no code changed.
- ROADMAP 17.1 checked, the M17 section given a paragraph explaining where 17.7–17.12 came
  from and that 17.5 stays last regardless of numbering, spec coverage rows extended, README
  milestone row flipped to in progress.

## What the review found

The surface was resolved by **importing every entry and enumerating live bindings** rather
than by reading the coverage map: **110 exports across 10 entries, 102 unique names** (the 8
root error classes are re-exports). Behind them sit **52 option typedefs** and **15 distinct
instance shapes** — and that is where the drift is. Each export was reviewed one milestone
at a time and each is defensible alone; the option bags and instance shapes had never been
read side by side.

**Seven freeze-critical findings**, all of which cost a major to fix after 1.0:

1. **Unknown option keys are accepted in silence** across all 52 bags — `bsBadge('x', {
   varient: 'danger' })` returns a default badge. Strictness cannot be added in a 1.x.
2. **`label` means two things** — the accessible name in six builders, the visible text in
   `bsButton` and `BsTableColumn`.
3. **Two auto-dismiss vocabularies** in one entry: `autoHideMs` on the alerts,
   `autohide`/`delay` on `bsToast`. With finding 1, mixing them fails silently.
4. **`update()` means three things** — re-render in three components, reposition in two —
   and `bsTable` calls the same job `setData()`.
5. **`show()` returns three types**: `void`, an `Element`, and a release closure.
6. **Use-after-`destroy()` is convention, not contract**: four instances throw a `TypeError`
   naming the API; `bsProgress` silently writes to a detached node.
7. **The `dompurify` peer range `^3`** admits versions affected by GHSA-55q2-fjhq-7xh7
   (`<= 3.4.12`), and the lockfile resolves to exactly 3.4.12. `sanitizeHtml` itself is not
   exposed — it pins `IN_PLACE: false` — but narrowing a peer range after 1.0 is breaking.

Plus four **additive** findings recorded but not blocking (adding an export or a method is a
minor): the instance member matrix (`destroy()` is 15/15 — the contract that mattered is
uniform; `isShown()` is 2/15 and missing from `bsModal`), the root re-exporting 8 of 10
error classes against ADR-0003's own words, three unfrozen exported singletons beside four
frozen constants, and spec 01 §5 enumerating 23 root exports against today's 35.

## What was checked and found sound

Recorded because negative results are evidence: the exports map (10 entries, `types` first,
publint --strict and attw node16 both clean), the `EGL_*` registry (10 classes, 10 codes, no
collisions, uniform `(message, details?)` constructors), **`signal` in 25 option bags with
exactly one meaning everywhere** — the strongest consistency result in the review — the
`{html, sanitize}` gate including `bsTable`'s per-column override, the
`container`/`target`/`toggler` first-parameter convention, and the two callback-order rules
(data-last for data callbacks, event-first for `delegate`), which are consistent and only
need writing down.

The `/sanitize` static import was **not** filed: 17.6 already owns it, written by the M17
planning PR before this review ran. It would otherwise have been finding zero.

## The judgement call in the verdict

The temptation in a readiness review is to return "green, ship it" — every gate passes,
2213 tests, 100% lines, no open bugs. The verdict deliberately does not say that. It says
the *content* is ready and the *shape* needs six decisions, because the only thing that
makes any of this urgent is the asymmetry between now and later, not risk.

It also names a defensible minimum — 17.7 and 17.8, the two a consumer meets on their first
call — so the owner has a shorter path if they want one, with the rest accepted as recorded
1.0 behaviour. Accepting a divergence deliberately is a legitimate answer; not noticing it
is not.

## Where the project stands

v0.9.0 released. M17 in progress: 17.1 done, 17.2–17.12 open. `.changeset/` empty,
`[Unreleased]` empty — this PR ships no user-visible library change. ADRs through 0046, next
free 0047. Every gate green on this branch.

## How the next session resumes

1. Wait for this PR to merge (one item per PR).
2. **17.7** is the review's recommended next item — the option-key contract, decision-heavy
   and needing an ADR, and the one whose answer governs every option bag the library will
   ever add. 17.8 and 17.9 land onto whatever it settles.
3. If the owner would rather take the runtime floor first, **17.2** is independent of all
   six review items and nothing in the review changes its analysis.

# 2026-08-07 — The overlay gate, and M12 complete (roadmap 12.2)

## What got done

- `loadingOverlay` on `egl-utils-js/dom` (spec 03 F50), joining `inlineAlert` in
  `dom-components.js`: a reference-counted gate over an injected `onShow`/`onHide` pair,
  with `show()` → idempotent release, `wrap()`, `isShown()`, `destroy()`.
- [ADR-0032](../../../adr/0032-overlay-gate-refcount-floor-and-focus.md) records the three
  semantics that are specific to a gate — the reference count, the floor measured from the
  appearance, and contained presentation failures — while inheriting the component shape
  from ADR-0031 rather than restating it.
- Patterns catalogue: **Bridge** implemented — the gate's behaviour varies independently of
  its presentation, which is exactly what will let spec-04's `bsLoadingOverlay` be a preset
  bridging to `bootstrap.Modal` instead of a second implementation of this timing.
- **M12 is complete.** README milestone row flipped to done.

## Decisions taken

- **The floor starts when `onShow` settles**, not at `show()`. Starting it at the call is
  the subtle version of the flicker bug: an animated presentation spends most of its
  anti-flicker budget before anything is on screen. A test asserts exactly this by making
  `onShow` take 300 ms and checking the full floor still applies afterwards.
- **Presentation hooks are called synchronously.** The first draft deferred them to a
  microtask so a synchronous throw and a rejection could share one containment path; a test
  caught the consequence — the presentation had not started when `show()` returned. Now the
  hook runs immediately inside a `try`, and both failure shapes are still contained.
- **Presentation failures are contained, not propagated** — the ADR-0027 sink rule applied
  to a second cross-cutting concern. The alternatives were an exception surfacing from an
  unrelated `release()` call or an unhandled rejection with no caller; a stuck overlay is
  the failure that would actually harm a user, and containment is what prevents it.
- **Only `focus.save` needs a document**, so the gate's timing logic runs and is tested in
  Node — NFR-14 as amended in 11.2, read strictly.
- **`signal` and `destroy()` were added to F50's spec line**, the same correction 12.1 made
  for F49: NFR-15 already named F50 among the exports whose teardown must ride an aborted
  signal, so the option list was the incomplete half.
- **No budget amendment this time.** `loadingOverlay` measures 958 B against the indicative
  1.25 kB, pinned at 1.03 kB. `/dom` re-baselined to 3436 B against its unchanged 4 kB
  clause — roughly 14% headroom left for M13's `bindTableControls`.

## Where the project stands

Milestones 1–12 complete, v0.4.0 tagged. Spec 03 has F49 and F50 done; **F42
(`tablePipeline`) and F51 (`bindTableControls`) remain** — the whole of M13.

Local verification: lint + `tsc` clean, **1192 tests green with 100% lines and branches on
every `/dom` file**, `docs:api` warning-free, api-floor unchanged at 29 inventoried APIs
(the gate introduces no new platform global), `check:package` green, consistency lint green.

## How the next session resumes

1. Wait for this PR to merge, then **cut v0.5.0** — one MINOR per completed milestone. Two
   changesets are pending (12.1 and 12.2). The documented gotchas still apply:
   `release-version.yml` cannot open its PR, so branch off `changeset-release/main` by hand;
   `changeset version` flattens `CHANGELOG.md`, so restore the Keep-a-Changelog skeleton and
   split the prose into `docs/changelog/v0/v0.5.0.md`; write `docs/releases/v0.5.0.md` in
   the same PR or `release.yml` fails; bump and prose must land together or the version
   lockstep check fails.
2. Then **13.1** on `feat/table-pipeline`: the pure controller on `/table`, composing the
   F33–F35 primitives and `EventEmitter`. Its indicative row is 2.75 kB.
3. Carried forward: GitHub Actions has not created a run for this repo since 2026-08-06, so
   M11, M12 and the pending release have landed on local verification only — the Node
   18/20/22 matrix and the Playwright job remain unrun. Spec 03 §6 *does* schedule a browser
   scenario for F50's focus save/blur/restore, so that Playwright case is owed as soon as
   the browser job can run again; it is the second entry in the M11/M12 browser-test debt.
